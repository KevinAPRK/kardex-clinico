// ============================================================
// TIPOS COMPARTIDOS — Kardex Clínico FASE 2 (corregido)
// ============================================================

export type MovementType = "entry" | "exit" | "adjustment" | "transfer" | "return" | "loss";
export type MovementStatus = "pending" | "confirmed" | "cancelled";
export type UserRole = "admin" | "pharmacist" | "nurse" | "auditor";

export interface Material {
  id: string;
  code: string;
  name: string;
  unit: string;
  requires_expiry: boolean;
  min_stock: number;
  is_active: boolean;
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
  created_by: string;
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
}

export interface FefoAllocation {
  lot_id: string;
  lot_number: string;
  expiry_date: string;
  available_qty: number;  // stock disponible en ese lote antes de la operación
  allocate_qty: number;   // cuánto se toma de este lote
}

export interface FefoResolution {
  allocations: FefoAllocation[];
  total_allocated: number;
  fulfilled: boolean;
}

// ── Payloads de Edge Functions ──────────────────────────────

export interface RegisterEntryPayload {
  material_id: string;
  quantity: number;
  unit_cost?: number;
  reference?: string;
  notes?: string;
  environment_id?: string;
  performed_at?: string;
  lot?: {
    lot_number: string;
    expiry_date: string;        // "YYYY-MM-DD"
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
  performed_at?: string;
}

export interface RegisterAdjustmentPayload {
  material_id: string;
  lot_id?: string;
  quantity: number;
  sign: "positive" | "negative";
  reference?: string;
  notes: string;
  performed_at?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// Resultado devuelto por la función PG process_exit_atomic
export interface AtomicExitResult {
  movement_ids: string[];
  allocations: FefoAllocation[];
  total_allocated: number;
}

// Resultado de process_entry_atomic
export interface AtomicEntryResult {
  movement_id: string;
  lot_id: string | null;
}
