// ============================================================
// EDGE FUNCTION: register-entry
// POST /functions/v1/register-entry
// Roles: admin, pharmacist
// TX: process_entry_atomic (PG) — lote + movimiento atómicos
// ============================================================
import { extractJwt, verifySession, verifyRoles, getServiceClient, jsonResponse, errorResponse, corsResponse } from "../_shared/client.ts";
import { getMaterial, executeAtomicEntry, checkStockAlert, getExpiringLots } from "../_shared/fefo.ts";
import { sendEntryConfirmed, sendLowStockAlert, sendExpiryAlert } from "../_shared/email.ts";
import type { RegisterEntryPayload } from "../_shared/types.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405);

  // ── Auth ────────────────────────────────────────────────
  const jwt = extractJwt(req);
  if (!jwt) return errorResponse("Missing token", "UNAUTHORIZED", 401);

  const session = await verifySession(jwt);
  if (!session) return errorResponse("Invalid session", "UNAUTHORIZED", 401);

  const service = getServiceClient();
  const hasRole = await verifyRoles(service, session.userId, ["admin", "pharmacist"]);
  if (!hasRole) return errorResponse("Insufficient permissions", "FORBIDDEN", 403);

  // ── Parse payload ───────────────────────────────────────
  let payload: RegisterEntryPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("JSON inválido", "BAD_REQUEST");
  }

  const { material_id, quantity, unit_cost, reference, notes, environment_id, performed_at } = payload;

  if (!material_id || !quantity || quantity <= 0 || !environment_id) {
    return errorResponse("material_id, quantity > 0 y environment_id son requeridos", "VALIDATION_ERROR");
  }

  try {
    // Pre-validación liviana (sin lock)
    const material = await getMaterial(service, material_id);

    // ── TX atómica en PostgreSQL ─────────────────────────
    // Lote + movimiento en una sola transacción con advisory lock.
    // Si el INSERT de movimiento falla, el lote hace rollback también.
    const result = await executeAtomicEntry(service, {
      material_id,
      quantity,
      unit_cost,
      reference,
      notes,
      environment_id,
      performed_at,
      performed_by: session.userId,
      lot_number:       null,
      expiry_date:      null,
      manufacture_date: null,
      supplier_id:      null,
    });

    // ── Side effects (fire-and-forget) ───────────────────
    const { data: profile } = await service
      .from("profiles")
      .select("full_name")
      .eq("id", session.userId)
      .single();

    const performedAt = performed_at ?? new Date().toISOString();

    // Email confirmación
    sendEntryConfirmed({
      to:           session.email,
      materialName: material.name,
      materialCode: material.code,
      quantity,
      unit:         material.unit,
      lotNumber:    null,
      expiryDate:   null,
      performedBy:  profile?.full_name ?? session.email,
      reference,
      timestamp:    performedAt,
    }).catch((e) => console.error("[entry email]", e));

    // Alertas post-operación (asíncronas)
    Promise.all([
      checkStockAlert(service, material_id).then((alert) => {
        if (alert.triggered) {
          return sendLowStockAlert({
            materialName: material.name,
            materialCode: material.code,
            currentQty:  alert.current_qty,
            minStock:    alert.min_stock,
            unit:        material.unit,
          });
        }
      }),
      material.requires_expiry
        ? getExpiringLots(service, material_id, 30).then((expiring) => {
            if (expiring.length > 0) {
              return sendExpiryAlert({
                materialName:    material.name,
                materialCode:    material.code,
                lots:            expiring,
                unit:            material.unit,
                daysUntilExpiry: 30,
              });
            }
          })
        : Promise.resolve(),
    ]).catch((e) => console.error("[entry alerts]", e));

    return jsonResponse({
      success: true,
      data: {
        movement_id:  result.movement_id,
        lot_id:       result.lot_id,
        material_id,
        quantity,
        performed_at: performedAt,
      },
    }, 201);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[register-entry]", msg);
    if (msg.includes("MATERIAL_NOT_FOUND")) return errorResponse(msg, "NOT_FOUND", 404);
    if (msg.includes("LOT_REQUIRED"))       return errorResponse(msg, "LOT_REQUIRED", 422);
    return errorResponse(msg, "INTERNAL_ERROR", 500);
  }
});
