// lib/validators/index.ts
import { z } from "zod";

// ── Material ─────────────────────────────────────────────────
export const materialSchema = z.object({
  name: z.string().min(2, "Nombre requerido").max(200),
  description: z.string().max(500).optional(),
  category: z.string().max(100).optional(),
  unit: z.string().min(1, "Unidad requerida").max(50),
  requires_expiry: z.boolean(),
  min_stock: z.coerce.number().int("Debe ser un número entero").min(0, "Mínimo 0"),
  default_supplier_id: z.string().uuid().optional().nullable(),
});
export type MaterialFormValues = z.infer<typeof materialSchema>;

// ── Proveedor ────────────────────────────────────────────────
export const supplierSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  ruc: z.string().max(20).optional(),
  contact_name: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.string().max(300).optional(),
});
export type SupplierFormValues = z.infer<typeof supplierSchema>;

// ── Entrada ──────────────────────────────────────────────────
export const entrySchema = z.object({
  material_id: z.string().uuid("Material requerido"),
  quantity: z.coerce.number().positive("Cantidad debe ser positiva"),
  unit_cost: z.coerce.number().min(0).optional(),
  notes: z.string().max(500).optional(),
  environment_id: z.string().uuid().optional().nullable(),
  performed_at: z.string().optional(),
  requires_lot: z.boolean(),
  lot_number: z.string().optional(),
  expiry_date: z.string().optional(),
  manufacture_date: z.string().optional(),
  supplier_id: z.string().uuid().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.requires_lot) {
    if (!data.lot_number?.trim()) {
      ctx.addIssue({ code: "custom", path: ["lot_number"], message: "Número de lote requerido" });
    }
    if (!data.expiry_date) {
      ctx.addIssue({ code: "custom", path: ["expiry_date"], message: "Fecha de vencimiento requerida" });
    }
  }
});
export type EntryFormValues = z.infer<typeof entrySchema>;

// ── Salida ───────────────────────────────────────────────────
export const exitSchema = z.object({
  material_id: z.string().uuid("Material requerido"),
  quantity: z.coerce.number().positive("Cantidad debe ser positiva"),
  environment_id: z.string().uuid("Servicio requerido"),
  notes: z.string().max(500).optional(),
  unit_cost: z.coerce.number().min(0).optional(),
  performed_at: z.string().optional(),
});
export type ExitFormValues = z.infer<typeof exitSchema>;

// ── Ajuste ───────────────────────────────────────────────────
export const adjustmentSchema = z.object({
  material_id: z.string().uuid("Material requerido"),
  lot_id: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive("Cantidad debe ser positiva"),
  sign: z.enum(["positive", "negative"]),
  notes: z.string().min(5, "Detalle requerido (min 5 caracteres)"),
  performed_at: z.string().optional(),
});
export type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

// ── Filtros reportes ─────────────────────────────────────────
export const reportFilterSchema = z.object({
  period: z.enum(["week", "month", "quarter"]),
  material_id: z.string().uuid().optional().nullable(),
  environment_id: z.string().uuid().optional().nullable(),
  type: z.enum(["all","entry","exit","adjustment"]),
});
export type ReportFilterValues = z.infer<typeof reportFilterSchema>;
