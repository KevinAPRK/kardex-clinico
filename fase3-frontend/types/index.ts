// ============================================================
// TYPES — Fase 3 Frontend
// Espejo del schema DB (Fase 1). Sin lógica de negocio.
// ============================================================

export type UserRole = "admin" | "pharmacist" | "nurse" | "auditor";
export type MovementType = "entry" | "exit" | "adjustment" | "transfer" | "return" | "loss";
export type MovementStatus = "pending" | "confirmed" | "cancelled";
export type MaterialUnit = string;

export interface Profile {
  id: string;
  full_name: string;
  license_number: string | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: MaterialUnit;
  requires_expiry: boolean;
  min_stock: number;
  default_supplier_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaterialUnitOption {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  ruc: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Lot {
  id: string;
  material_id: string;
  supplier_id: string | null;
  lot_number: string;
  expiry_date: string;
  manufacture_date: string | null;
  received_date: string;
  initial_qty: number;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface Movement {
  id: string;
  material_id: string;
  lot_id: string | null;
  environment_id: string | null;
  type: MovementType;
  quantity: number;
  unit_cost: number | null;
  reference: string | null;
  notes: string | null;
  status: MovementStatus;
  performed_by: string;
  performed_at: string;
  // Joined
  material?: { id: string; name: string; code: string; category?: string | null; unit: MaterialUnit };
  lot?: { id: string; lot_number: string; expiry_date: string } | null;
  environment?: { id: string; name: string } | null;
  performer?: { id: string; full_name: string };
}

export interface Environment {
  id: string;
  name: string;
  location: string | null;
  is_active: boolean;
}

// ── Vistas calculadas (Fase 1 SQL) ──────────────────────────

export interface StockByMaterial {
  material_id: string;
  material_name: string;
  material_code: string;
  unit: MaterialUnit;
  total_qty: number;
}

export interface StockByLot {
  material_id: string;
  material_name: string;
  material_code: string;
  unit: MaterialUnit;
  lot_id: string;
  lot_number: string;
  expiry_date: string;
  available_qty: number;
}

export interface StockAlert {
  material_id: string;
  material_name: string;
  material_code: string;
  unit: MaterialUnit;
  total_qty: number;
  min_stock: number;
  low_stock: boolean;
  nearest_expiry: string | null;
  expiring_soon: boolean;
}

export interface FefoQueueRow {
  material_id: string;
  lot_id: string;
  lot_number: string;
  expiry_date: string;
  available_qty: number;
  fefo_priority: number;
}

// ── Función get_kardex (Fase 2 SQL) ─────────────────────────

export interface KardexRow {
  movement_id: string;
  performed_at: string;
  type: MovementType;
  lot_number: string | null;
  expiry_date: string | null;
  environment: string | null;
  performed_by: string;
  reference: string | null;
  quantity_in: number;
  quantity_out: number;
  running_total: number;
}

// ── Edge Function payloads ───────────────────────────────────

export interface RegisterEntryPayload {
  material_id: string;
  quantity: number;
  unit_cost?: number;
  reference?: string;
  notes?: string;
  environment_id?: string;
  lot?: {
    lot_number: string;
    expiry_date: string;
    manufacture_date?: string;
    supplier_id?: string;
  };
}

export interface RegisterExitPayload {
  material_id: string;
  quantity: number;
  environment_id: string;
  reference?: string;
  notes?: string;
  unit_cost?: number;
}

export interface RegisterAdjustmentPayload {
  material_id: string;
  lot_id?: string;
  quantity: number;
  sign: "positive" | "negative";
  reference: string;
  notes: string;
}

// ── UI helpers ───────────────────────────────────────────────

export type AlertSeverity = "critical" | "warning" | "info";
