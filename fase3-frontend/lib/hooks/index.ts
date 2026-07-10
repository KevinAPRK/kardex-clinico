"use client";
// lib/hooks/index.ts
// Hooks de solo lectura. CERO lógica de negocio.
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Material, Supplier, Lot, Movement, Environment, MaterialCategory, MaterialUnitOption,
  StockByMaterial, StockByLot, StockAlert, FefoQueueRow, KardexRow,
} from "@/types";

function useSupabaseQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}

// ── MATERIALES ───────────────────────────────────────────────
export function useMaterials(search?: string) {
  const db = createClient();
  return useSupabaseQuery<Material[]>(async () => {
    let q = db.from("materials").select("*").eq("is_active", true).order("name");
    if (search) q = q.ilike("name", `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }, [search]);
}

export function useMaterial(id: string) {
  const db = createClient();
  return useSupabaseQuery<Material>(async () => {
    const { data, error } = await db.from("materials").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  }, [id]);
}

// ── CATEGORÍAS DE PRODUCTOS ─────────────────────────────────
export function useMaterialCategories() {
  const db = createClient();
  return useSupabaseQuery<MaterialCategory[]>(async () => {
    const { data, error } = await db
      .from("material_categories")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data ?? [];
  }, []);
}

// ── UNIDADES DE MEDIDA ──────────────────────────────────────
export function useMaterialUnits() {
  const db = createClient();
  return useSupabaseQuery<MaterialUnitOption[]>(async () => {
    const { data, error } = await db
      .from("material_units")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data ?? [];
  }, []);
}

// ── PROVEEDORES ──────────────────────────────────────────────
export function useSuppliers() {
  const db = createClient();
  return useSupabaseQuery<Supplier[]>(async () => {
    const { data, error } = await db
      .from("suppliers").select("*").eq("is_active", true).order("name");
    if (error) throw error;
    return data ?? [];
  }, []);
}

// ── ENTORNOS ─────────────────────────────────────────────────
export function useEnvironments() {
  const db = createClient();
  return useSupabaseQuery<Environment[]>(async () => {
    const { data, error } = await db
      .from("environments").select("*").eq("is_active", true).order("name");
    if (error) throw error;
    return data ?? [];
  }, []);
}

// ── STOCK ────────────────────────────────────────────────────
export function useStockByMaterial() {
  const db = createClient();
  return useSupabaseQuery<StockByMaterial[]>(async () => {
    const { data, error } = await db
      .from("stock_by_material").select("*").order("material_name");
    if (error) throw error;
    return data ?? [];
  }, []);
}

export function useStockByLot(materialId?: string) {
  const db = createClient();
  return useSupabaseQuery<StockByLot[]>(async () => {
    let q = db
      .from("stock_by_lot")
      .select("*")
      .gt("available_qty", 0)
      .order("material_name")
      .order("expiry_date", { ascending: true });

    if (materialId) q = q.eq("material_id", materialId);

    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }, [materialId]);
}

export function useStockAlerts() {
  const db = createClient();
  return useSupabaseQuery<StockAlert[]>(async () => {
    const { data, error } = await db
      .from("stock_alerts")
      .select("*")
      .or("low_stock.eq.true,expiring_soon.eq.true")
      .order("nearest_expiry", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }, []);
}

// ── LOTES ────────────────────────────────────────────────────
export function useLotsByMaterial(materialId: string) {
  const db = createClient();
  return useSupabaseQuery<FefoQueueRow[]>(async () => {
    if (!materialId) return [];
    const { data, error } = await db
      .from("fefo_queue")
      .select("*")
      .eq("material_id", materialId)
      .order("fefo_priority");
    if (error) throw error;
    return data ?? [];
  }, [materialId]);
}

export function useAllLots(materialId?: string) {
  const db = createClient();
  return useSupabaseQuery<Lot[]>(async () => {
    let q = db.from("lots").select("*").order("expiry_date", { ascending: true });
    if (materialId) q = q.eq("material_id", materialId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }, [materialId]);
}

// ── MOVIMIENTOS ──────────────────────────────────────────────
export function useMovements(filters?: {
  material_id?: string;
  environment_id?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const db = createClient();
  const key = JSON.stringify(filters);
  return useSupabaseQuery<Movement[]>(async () => {
    let q = db
      .from("movements")
      .select(`
        id, material_id, type, quantity, unit_cost, reference, notes, status, performed_at,
        material:materials(id, name, code, category, unit),
        lot:lots(id, lot_number, expiry_date),
        environment:environments(id, name),
        performer:profiles!performed_by(id, full_name)
      `)
      .eq("status", "confirmed")
      .order("performed_at", { ascending: false });

    if (filters?.material_id) q = q.eq("material_id", filters.material_id);
    if (filters?.environment_id) q = q.eq("environment_id", filters.environment_id);
    if (filters?.type && filters.type !== "all") q = q.eq("type", filters.type);
    if (filters?.from) q = q.gte("performed_at", filters.from);
    if (filters?.to) q = q.lte("performed_at", filters.to);
    q = q.limit(filters?.limit ?? 100);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as Movement[];
  }, [key]);
}

export function useLatestMaterialUnitCost(materialId?: string) {
  const db = createClient();
  return useSupabaseQuery<number | null>(async () => {
    if (!materialId) return null;

    const { data, error } = await db
      .from("movements")
      .select("unit_cost")
      .eq("material_id", materialId)
      .eq("status", "confirmed")
      .eq("type", "entry")
      .not("unit_cost", "is", null)
      .order("performed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data?.unit_cost ?? null;
  }, [materialId]);
}

// ── KARDEX ───────────────────────────────────────────────────
export function useKardex(materialId: string, from?: string, to?: string) {
  const db = createClient();
  return useSupabaseQuery<KardexRow[]>(async () => {
    if (!materialId) return [];
    const { data, error } = await db.rpc("get_kardex", {
      p_material_id: materialId,
      p_from: from ?? null,
      p_to: to ?? null,
    });
    if (error) throw error;
    return data ?? [];
  }, [materialId, from, to]);
}

// ── DASHBOARD SUMMARY ────────────────────────────────────────
export function useDashboardSummary() {
  const db = createClient();
  return useSupabaseQuery(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const [alertsRes, movementsRes] = await Promise.all([
      db.from("stock_alerts")
        .select("low_stock, expiring_soon")
        .or("low_stock.eq.true,expiring_soon.eq.true"),
      db.from("movements")
        .select("id, type")
        .eq("status", "confirmed")
        .gte("performed_at", sevenDaysAgo),
    ]);
    const alerts = alertsRes.data ?? [];
    const movements = movementsRes.data ?? [];
    return {
      low_stock_count: alerts.filter((a) => a.low_stock).length,
      expiring_soon_count: alerts.filter((a) => a.expiring_soon).length,
      movements_7d: movements.length,
      entries_7d: movements.filter((m) => m.type === "entry").length,
      exits_7d: movements.filter((m) => m.type === "exit").length,
    };
  }, []);
}
