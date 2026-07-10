// ============================================================
// EDGE FUNCTION: register-adjustment
// POST /functions/v1/register-adjustment
// Roles: admin únicamente
// TX: process_adjustment_atomic (PG) — advisory lock
// ============================================================
import { extractJwt, verifySession, verifyRoles, getServiceClient, jsonResponse, errorResponse, corsResponse } from "../_shared/client.ts";
import type { RegisterAdjustmentPayload } from "../_shared/types.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405);

  const jwt = extractJwt(req);
  if (!jwt) return errorResponse("Missing token", "UNAUTHORIZED", 401);

  const session = await verifySession(jwt);
  if (!session) return errorResponse("Invalid session", "UNAUTHORIZED", 401);

  const service = getServiceClient();
  const hasRole = await verifyRoles(service, session.userId, ["admin"]);
  if (!hasRole) return errorResponse("Solo administradores pueden registrar ajustes", "FORBIDDEN", 403);

  let payload: RegisterAdjustmentPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("JSON inválido", "BAD_REQUEST");
  }

  const { material_id, lot_id, quantity, sign, reference, notes, performed_at } = payload;

  if (!material_id || !quantity || quantity <= 0 || !sign || !notes?.trim()) {
    return errorResponse(
      "material_id, quantity > 0, sign y notes son requeridos",
      "VALIDATION_ERROR"
    );
  }
  if (!["positive", "negative"].includes(sign)) {
    return errorResponse("sign debe ser 'positive' o 'negative'", "VALIDATION_ERROR");
  }

  try {
    const { data, error } = await service.rpc("process_adjustment_atomic", {
      p_material_id:  material_id,
      p_lot_id:       lot_id ?? null,
      p_quantity:     quantity,
      p_sign:         sign,
      p_reference:    reference ?? null,
      p_notes:        notes,
      p_performed_by: session.userId,
      p_performed_at: performed_at ?? null,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("MATERIAL_NOT_FOUND")) return errorResponse(msg, "NOT_FOUND", 404);
      if (msg.includes("LOT_REQUIRED"))       return errorResponse(msg, "LOT_REQUIRED", 422);
      if (msg.includes("INSUFFICIENT_STOCK")) return errorResponse(msg, "INSUFFICIENT_STOCK", 422);
      return errorResponse(msg, "DB_ERROR", 500);
    }

    const row = (data as Array<{ movement_id: string; movement_type: string }>)[0];

    return jsonResponse({
      success: true,
      data: {
        movement_id:   row.movement_id,
        movement_type: row.movement_type,
        material_id,
        lot_id: lot_id ?? null,
        quantity,
        sign,
        performed_at: performed_at ?? new Date().toISOString(),
      },
    }, 201);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[register-adjustment]", msg);
    return errorResponse(msg, "INTERNAL_ERROR", 500);
  }
});
