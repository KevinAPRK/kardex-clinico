// ============================================================
// FEFO ENGINE — helpers para Edge Functions
// La lógica transaccional real vive en process_exit_atomic (PG).
// Aquí: lectura de stock, validaciones previas, alertas.
// ============================================================
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { FefoAllocation, FefoResolution, AtomicExitResult, AtomicEntryResult } from "./types.ts";

// ── Obtener material ────────────────────────────────────────
export async function getMaterial(client: SupabaseClient, materialId: string) {
  const { data, error } = await client
    .from("materials")
    .select("id, name, code, unit, requires_expiry, min_stock, is_active")
    .eq("id", materialId)
    .eq("is_active", true)
    .single();
  if (error || !data) throw new Error(`MATERIAL_NOT_FOUND: ${materialId}`);
  return data;
}

// ── Stock actual (para pre-validación rápida, sin lock) ─────
export async function calculateStock(client: SupabaseClient, materialId: string): Promise<number> {
  const { data, error } = await client
    .from("stock_by_material")
    .select("total_qty")
    .eq("material_id", materialId)
    .maybeSingle();
  if (error) throw new Error(`Stock query failed: ${error.message}`);
  return data?.total_qty ?? 0;
}

// Pre-validación rápida antes de llamar a la función atómica.
// La validación definitiva está dentro del advisory lock en PG.
export async function assertSufficientStock(
  client: SupabaseClient,
  materialId: string,
  quantityNeeded: number,
  materialName: string
): Promise<void> {
  const current = await calculateStock(client, materialId);
  if (current < quantityNeeded) {
    throw new Error(
      `INSUFFICIENT_STOCK: "${materialName}" tiene ${current} unidades disponibles, se requieren ${quantityNeeded}.`
    );
  }
}

// ── Buscar lote existente ───────────────────────────────────
export async function findExistingLot(
  client: SupabaseClient,
  materialId: string,
  lotNumber: string
): Promise<string | null> {
  const { data } = await client
    .from("lots")
    .select("id")
    .eq("material_id", materialId)
    .eq("lot_number", lotNumber)
    .maybeSingle();
  return data?.id ?? null;
}

// ── Preview FEFO (sin lock — solo informativo) ──────────────
// Muestra al usuario qué lotes se consumirían. La resolución
// real y atómica ocurre dentro de process_exit_atomic.
export async function previewFefo(
  client: SupabaseClient,
  materialId: string,
  quantityNeeded: number
): Promise<FefoResolution> {
  const { data: lots, error } = await client
    .from("fefo_queue")
    .select("lot_id, lot_number, expiry_date, available_qty, fefo_priority")
    .eq("material_id", materialId)
    .gt("available_qty", 0)
    .order("fefo_priority", { ascending: true });

  if (error) throw new Error(`FEFO preview failed: ${error.message}`);
  if (!lots?.length) return { allocations: [], total_allocated: 0, fulfilled: false };

  const allocations: FefoAllocation[] = [];
  let remaining = quantityNeeded;

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.available_qty, remaining);
    allocations.push({
      lot_id: lot.lot_id,
      lot_number: lot.lot_number,
      expiry_date: lot.expiry_date,
      available_qty: lot.available_qty,
      allocate_qty: take,
    });
    remaining -= take;
  }

  return {
    allocations,
    total_allocated: quantityNeeded - remaining,
    fulfilled: remaining <= 0,
  };
}

// ── Invocar process_exit_atomic via RPC ─────────────────────
export async function executeAtomicExit(
  client: SupabaseClient,
  params: {
    material_id: string;
    quantity: number;
    environment_id: string;
    performed_by: string;
    reference?: string;
    notes?: string;
    unit_cost?: number;
    performed_at?: string;
  }
): Promise<AtomicExitResult> {
  const { data, error } = await client.rpc("process_exit_atomic", {
    p_material_id:    params.material_id,
    p_quantity:       params.quantity,
    p_environment_id: params.environment_id,
    p_performed_by:   params.performed_by,
    p_reference:      params.reference ?? null,
    p_notes:          params.notes ?? null,
    p_unit_cost:      params.unit_cost ?? null,
    p_performed_at:   params.performed_at ?? null,
  });

  if (error) {
    // Mapear errores de PG a códigos de negocio
    const msg = error.message ?? "";
    if (msg.includes("INSUFFICIENT_STOCK")) throw new Error(msg);
    if (msg.includes("MATERIAL_NOT_FOUND"))  throw new Error(msg);
    if (msg.includes("ENV_NOT_FOUND"))       throw new Error(msg);
    if (msg.includes("FEFO_INCOMPLETE"))     throw new Error(msg);
    throw new Error(`DB_ERROR: ${msg}`);
  }

  // data es un array de exit_allocation rows
  const rows = (data as Array<{
    movement_id: string;
    lot_id: string | null;
    lot_number: string | null;
    expiry_date: string | null;
    allocate_qty: number;
  }>);

  const allocations: FefoAllocation[] = rows
    .filter((r) => r.lot_id !== null)
    .map((r) => ({
      lot_id:       r.lot_id!,
      lot_number:   r.lot_number!,
      expiry_date:  r.expiry_date!,
      available_qty: 0, // post-operación; no necesario en respuesta
      allocate_qty: r.allocate_qty,
    }));

  return {
    movement_ids: rows.map((r) => r.movement_id),
    allocations,
    total_allocated: params.quantity,
  };
}

// ── Invocar process_entry_atomic via RPC ────────────────────
export async function executeAtomicEntry(
  client: SupabaseClient,
  params: {
    material_id: string;
    quantity: number;
    unit_cost?: number;
    reference?: string;
    notes?: string;
    environment_id?: string;
    performed_by: string;
    performed_at?: string;
    lot_number?: string;
    expiry_date?: string;
    manufacture_date?: string;
    supplier_id?: string;
  }
): Promise<AtomicEntryResult> {
  const { data, error } = await client.rpc("process_entry_atomic", {
    p_material_id:      params.material_id,
    p_quantity:         params.quantity,
    p_unit_cost:        params.unit_cost ?? null,
    p_reference:        params.reference ?? null,
    p_notes:            params.notes ?? null,
    p_environment_id:   params.environment_id ?? null,
    p_performed_by:     params.performed_by,
    p_performed_at:     params.performed_at ?? null,
    p_lot_number:       params.lot_number ?? null,
    p_expiry_date:      params.expiry_date ?? null,
    p_manufacture_date: params.manufacture_date ?? null,
    p_supplier_id:      params.supplier_id ?? null,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("MATERIAL_NOT_FOUND")) throw new Error(msg);
    if (msg.includes("LOT_REQUIRED"))       throw new Error(msg);
    throw new Error(`DB_ERROR: ${msg}`);
  }

  const row = (data as Array<{ movement_id: string; lot_id: string | null }>)[0];
  return { movement_id: row.movement_id, lot_id: row.lot_id };
}

// ── Alerta stock bajo ───────────────────────────────────────
export async function checkStockAlert(
  client: SupabaseClient,
  materialId: string
): Promise<{ triggered: boolean; current_qty: number; min_stock: number; material_name: string; unit: string }> {
  const { data } = await client
    .from("stock_alerts")
    .select("material_name, total_qty, min_stock, low_stock, unit")
    .eq("material_id", materialId)
    .maybeSingle();
  return {
    triggered:     data?.low_stock    ?? false,
    current_qty:   data?.total_qty    ?? 0,
    min_stock:     data?.min_stock    ?? 0,
    material_name: data?.material_name ?? "",
    unit:          data?.unit          ?? "",
  };
}

// ── Lotes próximos a vencer ─────────────────────────────────
export async function getExpiringLots(
  client: SupabaseClient,
  materialId: string,
  withinDays = 30
): Promise<Array<{ lot_id: string; lot_number: string; expiry_date: string; available_qty: number }>> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + withinDays);

  const { data } = await client
    .from("fefo_queue")
    .select("lot_id, lot_number, expiry_date, available_qty")
    .eq("material_id", materialId)
    .lte("expiry_date", threshold.toISOString().split("T")[0])
    .gt("available_qty", 0)
    .order("expiry_date", { ascending: true });

  return data ?? [];
}
