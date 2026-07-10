// ============================================================
// EDGE FUNCTION: register-exit
// POST /functions/v1/register-exit
// Roles: admin, pharmacist
//
// FEFO MULTI-LOTE ATÓMICO:
//   1. Pre-validación rápida (sin lock) para respuesta temprana
//   2. process_exit_atomic (PG) — advisory lock + loop FEFO
//      + INSERT por lote + verificación final, todo en 1 TX
//   3. Si PG hace rollback, ningún movimiento queda registrado
//   4. Emails + alertas fire-and-forget post-TX
// ============================================================
import { extractJwt, verifySession, verifyRoles, getServiceClient, jsonResponse, errorResponse, corsResponse } from "../_shared/client.ts";
import { getMaterial, assertSufficientStock, executeAtomicExit, checkStockAlert, getExpiringLots } from "../_shared/fefo.ts";
import { sendExitConfirmed, sendLowStockAlert, sendExpiryAlert } from "../_shared/email.ts";
import type { RegisterExitPayload } from "../_shared/types.ts";

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
  let payload: RegisterExitPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("JSON inválido", "BAD_REQUEST");
  }

  const { material_id, quantity, environment_id, reference, notes, unit_cost, performed_at } = payload;

  if (!material_id || !quantity || quantity <= 0 || !environment_id) {
    return errorResponse(
      "material_id, quantity > 0 y environment_id son requeridos",
      "VALIDATION_ERROR"
    );
  }

  try {
    // ── Pre-validaciones sin lock (fallo rápido) ─────────
    const [material] = await Promise.all([
      getMaterial(service, material_id),
    ]);

    // Stock check optimista — la validación real está en PG con lock
    await assertSufficientStock(service, material_id, quantity, material.name);

    // ── TX atómica: FEFO multi-lote en PostgreSQL ────────
    //
    // process_exit_atomic hace:
    //   1. pg_advisory_xact_lock(hash(material_id))
    //      → serializa concurrencia por material
    //   2. Re-verifica stock dentro del lock
    //   3. Itera fefo_queue ordenada por expiry_date ASC
    //   4. INSERT movements por cada lote hasta cubrir quantity
    //   5. Verifica que remaining == 0, sino ROLLBACK
    //   All in one PostgreSQL transaction.
    //
    const atomicResult = await executeAtomicExit(service, {
      material_id,
      quantity,
      environment_id,
      performed_by: session.userId,
      reference,
      notes,
      unit_cost,
      performed_at,
    });

    const performedAt = performed_at ?? new Date().toISOString();

    // ── Side effects async (post-TX, no afectan consistencia) ──
    const { data: profile } = await service
      .from("profiles")
      .select("full_name")
      .eq("id", session.userId)
      .single();

    const { data: env } = await service
      .from("environments")
      .select("name")
      .eq("id", environment_id)
      .single();

    // Email salida + alertas en paralelo, fire-and-forget
    Promise.all([
      sendExitConfirmed({
        to:           session.email,
        materialName: material.name,
        materialCode: material.code,
        quantity,
        unit:         material.unit,
        environment:  env?.name ?? environment_id,
        allocations:  atomicResult.allocations,
        performedBy:  profile?.full_name ?? session.email,
        reference,
        timestamp:    performedAt,
      }),

      // Alerta stock bajo post-salida
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

      // Alerta vencimiento si hay lotes dentro de 30 días post-operación
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
    ]).catch((e) => console.error("[exit side-effects]", e));

    // ── Respuesta ────────────────────────────────────────
    return jsonResponse({
      success: true,
      data: {
        movement_ids:     atomicResult.movement_ids,
        material_id,
        total_quantity:   quantity,
        lots_consumed:    atomicResult.allocations.length,
        fefo_allocations: atomicResult.allocations.length > 0
          ? atomicResult.allocations
          : null,
        environment_id,
        performed_at: performedAt,
      },
    }, 201);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[register-exit]", msg);

    if (msg.includes("INSUFFICIENT_STOCK")) return errorResponse(msg, "INSUFFICIENT_STOCK", 422);
    if (msg.includes("MATERIAL_NOT_FOUND")) return errorResponse(msg, "NOT_FOUND", 404);
    if (msg.includes("ENV_NOT_FOUND"))      return errorResponse(msg, "ENV_NOT_FOUND", 404);
    if (msg.includes("FEFO_INCOMPLETE"))    return errorResponse(msg, "FEFO_INCOMPLETE", 422);
    if (msg.includes("DB_ERROR"))           return errorResponse(msg, "DB_ERROR", 500);
    return errorResponse(msg, "INTERNAL_ERROR", 500);
  }
});
