// ============================================================
// SUPABASE QUERIES — Kardex Clínico FASE 2
// Listos para usar desde Server Components o Server Actions
// de Next.js App Router con @supabase/ssr
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";

// ── STOCK ───────────────────────────────────────────────────

/** Stock total por material (todas las categorías) */
export async function queryStockByMaterial(client: SupabaseClient) {
  return client
    .from("stock_by_material")
    .select("material_id, material_name, material_code, unit, total_qty")
    .order("material_name");
}

/** Stock desglosado por lote con info de vencimiento */
export async function queryStockByLot(client: SupabaseClient, materialId?: string) {
  let q = client
    .from("stock_by_lot")
    .select("material_id, material_name, material_code, lot_id, lot_number, expiry_date, available_qty, unit")
    .gt("available_qty", 0)
    .order("expiry_date", { ascending: true });

  if (materialId) q = q.eq("material_id", materialId);
  return q;
}

/** Cola FEFO para un material (previsualización antes de salida) */
export async function queryFefoQueue(client: SupabaseClient, materialId: string) {
  return client
    .from("fefo_queue")
    .select("lot_id, lot_number, expiry_date, available_qty, fefo_priority")
    .eq("material_id", materialId)
    .order("fefo_priority");
}

/** Stock actual de un material específico */
export async function queryMaterialStock(
  client: SupabaseClient,
  materialId: string
): Promise<number> {
  const { data } = await client
    .from("stock_by_material")
    .select("total_qty")
    .eq("material_id", materialId)
    .maybeSingle();
  return data?.total_qty ?? 0;
}

// ── ALERTAS ─────────────────────────────────────────────────

/** Todos los materiales con stock bajo o lotes próximos a vencer */
export async function queryStockAlerts(client: SupabaseClient) {
  return client
    .from("stock_alerts")
    .select("material_id, material_name, material_code, total_qty, min_stock, low_stock, nearest_expiry, expiring_soon")
    .or("low_stock.eq.true,expiring_soon.eq.true")
    .order("nearest_expiry", { ascending: true });
}

/** Lotes que vencen en N días con stock > 0 */
export async function queryExpiringLots(client: SupabaseClient, withinDays = 30) {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + withinDays);

  return client
    .from("fefo_queue")
    .select("material_id, material_name, lot_id, lot_number, expiry_date, available_qty, unit")
    .lte("expiry_date", threshold.toISOString().split("T")[0])
    .gt("available_qty", 0)
    .order("expiry_date");
}

// ── MOVIMIENTOS ─────────────────────────────────────────────

/** Historial de movimientos con joins legibles */
export async function queryMovements(
  client: SupabaseClient,
  filters?: {
    material_id?: string;
    environment_id?: string;
    type?: string;
    from?: string; // ISO date
    to?: string;
    limit?: number;
  }
) {
  let q = client
    .from("movements")
    .select(`
      id,
      type,
      quantity,
      unit_cost,
      reference,
      notes,
      status,
      performed_at,
      material:materials(id, name, code, unit),
      lot:lots(id, lot_number, expiry_date),
      environment:environments(id, name),
      performer:profiles!performed_by(id, full_name)
    `)
    .eq("status", "confirmed")
    .order("performed_at", { ascending: false });

  if (filters?.material_id) q = q.eq("material_id", filters.material_id);
  if (filters?.environment_id) q = q.eq("environment_id", filters.environment_id);
  if (filters?.type) q = q.eq("type", filters.type);
  if (filters?.from) q = q.gte("performed_at", filters.from);
  if (filters?.to) q = q.lte("performed_at", filters.to);
  q = q.limit(filters?.limit ?? 100);

  return q;
}

/** Trazabilidad completa de un lote */
export async function queryLotTraceability(client: SupabaseClient, lotId: string) {
  return client
    .from("movements")
    .select(`
      id,
      type,
      quantity,
      reference,
      notes,
      performed_at,
      environment:environments(id, name),
      performer:profiles!performed_by(id, full_name, license_number)
    `)
    .eq("lot_id", lotId)
    .eq("status", "confirmed")
    .order("performed_at");
}

/** Kardex de un material (entradas y salidas cronológicas con saldo acumulado) */
export async function queryKardex(
  client: SupabaseClient,
  materialId: string,
  from?: string,
  to?: string
) {
  // Supabase no soporta SUM() running total nativo; se hace en la app
  let q = client
    .from("movements")
    .select(`
      id,
      type,
      quantity,
      performed_at,
      reference,
      lot:lots(lot_number, expiry_date),
      environment:environments(name),
      performer:profiles!performed_by(full_name)
    `)
    .eq("material_id", materialId)
    .eq("status", "confirmed")
    .order("performed_at");

  if (from) q = q.gte("performed_at", from);
  if (to) q = q.lte("performed_at", to);
  return q;
}

// ── MATERIALES Y LOTES ──────────────────────────────────────

export async function queryMaterials(
  client: SupabaseClient,
  search?: string
) {
  let q = client
    .from("materials")
    .select("id, code, name, unit, requires_expiry, min_stock, category, is_active")
    .eq("is_active", true)
    .order("name");

  if (search) q = q.ilike("name", `%${search}%`);
  return q;
}

export async function queryMaterialWithStock(
  client: SupabaseClient,
  materialId: string
) {
  const [{ data: material }, { data: stock }] = await Promise.all([
    client
      .from("materials")
      .select("*, supplier:suppliers(id, name)")
      .eq("id", materialId)
      .single(),
    client
      .from("stock_by_material")
      .select("total_qty")
      .eq("material_id", materialId)
      .maybeSingle(),
  ]);

  return { material, total_qty: stock?.total_qty ?? 0 };
}

export async function queryLotsByMaterial(
  client: SupabaseClient,
  materialId: string,
  onlyWithStock = false
) {
  const q = onlyWithStock
    ? client
        .from("fefo_queue")
        .select("lot_id, lot_number, expiry_date, available_qty, fefo_priority")
        .eq("material_id", materialId)
        .order("fefo_priority")
    : client
        .from("lots")
        .select("id, lot_number, expiry_date, initial_qty, received_date, supplier:suppliers(name)")
        .eq("material_id", materialId)
        .order("expiry_date");

  return q;
}

// ── DASHBOARD ───────────────────────────────────────────────

/** Resumen ejecutivo para dashboard */
export async function queryDashboardSummary(client: SupabaseClient) {
  const [alerts, movements7d] = await Promise.all([
    client
      .from("stock_alerts")
      .select("low_stock, expiring_soon")
      .or("low_stock.eq.true,expiring_soon.eq.true"),
    client
      .from("movements")
      .select("id, type, quantity, performed_at")
      .eq("status", "confirmed")
      .gte("performed_at", new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  const alertData = alerts.data ?? [];
  return {
    low_stock_count: alertData.filter((a) => a.low_stock).length,
    expiring_soon_count: alertData.filter((a) => a.expiring_soon).length,
    movements_last_7d: movements7d.data?.length ?? 0,
    entries_last_7d: movements7d.data?.filter((m) => m.type === "entry").length ?? 0,
    exits_last_7d: movements7d.data?.filter((m) => m.type === "exit").length ?? 0,
  };
}
