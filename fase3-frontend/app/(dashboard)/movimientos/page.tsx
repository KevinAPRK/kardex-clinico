"use client";
// app/(dashboard)/movimientos/page.tsx
// Llama Edge Functions. CERO lógica de negocio en este archivo.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Header } from "@/components/layout/Header";
import { PageHeader, MovementBadge, LoadingSpinner, EmptyState, AlertBanner } from "@/components/shared";
import { useMaterials, useMovements, useEnvironments, useLotsByMaterial } from "@/lib/hooks";
import { entrySchema, exitSchema, adjustmentSchema, type EntryFormValues, type ExitFormValues, type AdjustmentFormValues } from "@/lib/validators";
import { callEdgeFunction } from "@/lib/supabase/edge";
import { formatDateTime } from "@/lib/utils";
import { Plus, ArrowUpRight, ArrowDownRight, SlidersHorizontal, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "historial" | "entrada" | "salida" | "ajuste";

export default function MovimientosPage() {
  const [activeTab, setActiveTab] = useState<Tab>("historial");
  const [typeFilter, setTypeFilter] = useState("all");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: movements, loading: movLoading, refetch: refetchMovements } = useMovements({
    type: typeFilter !== "all" ? typeFilter : undefined,
    limit: 100,
  });
  const { data: materials } = useMaterials();
  const { data: environments } = useEnvironments();

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "historial", label: "Historial", icon: SlidersHorizontal },
    { id: "entrada",   label: "Registrar Entrada", icon: ArrowUpRight },
    { id: "salida",    label: "Registrar Salida",  icon: ArrowDownRight },
    { id: "ajuste",    label: "Ajuste de Stock",   icon: Filter },
  ];

  function showFeedback(msg: string, isError = false) {
    if (isError) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(null); setSuccess(null); }, 4000);
  }

  return (
    <div>
      <Header title="Movimientos" subtitle="Entradas, salidas y ajustes de inventario" />
      <div className="p-6">
        <PageHeader title="Control de Movimientos" />

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 mb-6 w-fit">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                activeTab === id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}>
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {success && <div className="mb-4"><AlertBanner type="success" message={success} /></div>}
        {error && <div className="mb-4"><AlertBanner type="error" message={error} /></div>}

        {activeTab === "historial" && (
          <HistorialTab
            movements={movements ?? []}
            loading={movLoading}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
          />
        )}
        {activeTab === "entrada" && (
          <EntradaForm
            materials={materials ?? []}
            environments={environments ?? []}
            onSuccess={(msg) => { showFeedback(msg); refetchMovements(); setActiveTab("historial"); }}
            onError={(msg) => showFeedback(msg, true)}
          />
        )}
        {activeTab === "salida" && (
          <SalidaForm
            materials={materials ?? []}
            environments={environments ?? []}
            onSuccess={(msg) => { showFeedback(msg); refetchMovements(); setActiveTab("historial"); }}
            onError={(msg) => showFeedback(msg, true)}
          />
        )}
        {activeTab === "ajuste" && (
          <AjusteForm
            materials={materials ?? []}
            onSuccess={(msg) => { showFeedback(msg); refetchMovements(); setActiveTab("historial"); }}
            onError={(msg) => showFeedback(msg, true)}
          />
        )}
      </div>
    </div>
  );
}

// ── HISTORIAL ────────────────────────────────────────────────
function HistorialTab({ movements, loading, typeFilter, setTypeFilter }: {
  movements: import("@/types").Movement[];
  loading: boolean;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
}) {
  const types = [
    { value: "all",        label: "Todos" },
    { value: "entry",      label: "Entradas" },
    { value: "exit",       label: "Salidas" },
    { value: "adjustment", label: "Ajustes" },
    { value: "loss",       label: "Pérdidas" },
  ];

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {types.map(({ value, label }) => (
          <button key={value} onClick={() => setTypeFilter(value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              typeFilter === value
                ? "bg-slate-900 text-white border-slate-900"
                : "border-slate-300 text-slate-600 hover:border-slate-400"
            )}>
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? <LoadingSpinner /> : !movements.length ? (
          <EmptyState title="Sin movimientos" description="No hay movimientos que coincidan con el filtro." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Tipo</th>
                <th className="px-5 py-3 text-left font-medium">Material</th>
                <th className="px-5 py-3 text-left font-medium">Lote</th>
                <th className="px-5 py-3 text-right font-medium">Cantidad</th>
                <th className="px-5 py-3 text-left font-medium">Servicio</th>
                <th className="px-5 py-3 text-left font-medium">Referencia</th>
                <th className="px-5 py-3 text-left font-medium">Realizado por</th>
                <th className="px-5 py-3 text-left font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {movements.map((mv) => (
                <tr key={mv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3"><MovementBadge type={mv.type} /></td>
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {(mv.material as { name: string })?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">
                    {(mv.lot as { lot_number: string } | null)?.lot_number ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-slate-700">
                    {mv.quantity.toLocaleString("es-PE")}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {(mv.environment as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{mv.reference ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">
                    {(mv.performer as { full_name: string })?.full_name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{formatDateTime(mv.performed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── ENTRADA FORM ─────────────────────────────────────────────
function EntradaForm({ materials, environments, onSuccess, onError }: {
  materials: import("@/types").Material[];
  environments: import("@/types").Environment[];
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { requires_lot: false },
  });

  const selectedMaterialId = watch("material_id");
  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId);
  const materialField = register("material_id");

  // Sincronizar requires_lot cuando cambia el material
  const handleMaterialChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setValue("material_id", id);
    setValue("requires_lot", false);
  };

  async function onSubmit(values: EntryFormValues) {
    setSaving(true);
    const payload: import("@/types").RegisterEntryPayload = {
      material_id: values.material_id,
      quantity: values.quantity,
      unit_cost: values.unit_cost,
      reference: values.reference,
      notes: values.notes,
      environment_id: values.environment_id || undefined,
      lot: undefined,
    };
    const { error } = await callEdgeFunction("register-entry", payload as Record<string, unknown>);
    setSaving(false);
    if (error) { onError(error); return; }
    reset();
    onSuccess(`✅ Entrada registrada correctamente.`);
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <ArrowUpRight className="h-5 w-5 text-emerald-600" />
          <h3 className="font-semibold text-slate-900">Registrar Entrada</h3>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Material *" error={errors.material_id?.message}>
            <select
              {...materialField}
              onChange={(e) => {
                materialField.onChange(e);
                handleMaterialChange(e);
              }}
              className={iCls(!!errors.material_id)}
            >
              <option value="">— Seleccionar material —</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Cantidad *" error={errors.quantity?.message}>
              <input type="number" step="0.01" {...register("quantity")} className={iCls(!!errors.quantity)}
                placeholder={selectedMaterial ? `en ${selectedMaterial.unit}` : "0"} />
            </FormField>
            <FormField label="Costo unitario" error={undefined}>
              <input type="number" step="0.01" {...register("unit_cost")} className={iCls(false)} placeholder="S/ 0.00" />
            </FormField>
          </div>

          <FormField label="Ambiente" error={undefined}>
            <select {...register("environment_id")} className={iCls(false)}>
              <option value="">— Ninguno —</option>
              {environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </FormField>

          <FormField label="Referencia (O/C, guía, etc.)" error={undefined}>
            <input {...register("reference")} className={iCls(false)} placeholder="OC-2024-001" />
          </FormField>

          <FormField label="Notas" error={undefined}>
            <textarea {...register("notes")} rows={2} className={iCls(false) + " resize-none"} />
          </FormField>

          <button type="submit" disabled={saving}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            {saving ? "Registrando entrada..." : "Confirmar Entrada"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── SALIDA FORM ──────────────────────────────────────────────
function SalidaForm({ materials, environments, onSuccess, onError }: {
  materials: import("@/types").Material[];
  environments: import("@/types").Environment[];
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<ExitFormValues>({
    resolver: zodResolver(exitSchema),
  });

  const selectedMaterialId = watch("material_id");
  const { data: fefoQueue } = useLotsByMaterial(selectedMaterialId ?? "");

  async function onSubmit(values: ExitFormValues) {
    setSaving(true);
    const { error } = await callEdgeFunction("register-exit", values as unknown as Record<string, unknown>);
    setSaving(false);
    if (error) { onError(error); return; }
    reset();
    onSuccess("✅ Salida registrada. FEFO aplicado automáticamente.");
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <ArrowDownRight className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-slate-900">Registrar Salida</h3>
        </div>

        {/* FEFO preview */}
        {fefoQueue && fefoQueue.length > 0 && (
          <div className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50 p-3">
            <p className="text-xs font-semibold text-cyan-700 mb-2 uppercase tracking-wide">Cola FEFO — lotes disponibles</p>
            <div className="space-y-1">
              {fefoQueue.slice(0, 4).map((lot, i) => (
                <div key={lot.lot_id} className="flex items-center justify-between text-xs">
                  <span className="text-cyan-800">
                    {i + 1}. {lot.lot_number} — vence {lot.expiry_date}
                  </span>
                  <span className="font-mono font-semibold text-cyan-900">{lot.available_qty}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-cyan-600">El backend seleccionará el orden de consumo automáticamente.</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Material *" error={errors.material_id?.message}>
            <select {...register("material_id")} className={iCls(!!errors.material_id)}>
              <option value="">— Seleccionar material —</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Cantidad *" error={errors.quantity?.message}>
              <input type="number" step="0.01" {...register("quantity")} className={iCls(!!errors.quantity)} />
            </FormField>
            <FormField label="Costo unitario" error={undefined}>
              <input type="number" step="0.01" {...register("unit_cost")} className={iCls(false)} placeholder="S/ 0.00" />
            </FormField>
          </div>

          <FormField label="Ambiente destino *" error={errors.environment_id?.message}>
            <select {...register("environment_id")} className={iCls(!!errors.environment_id)}>
              <option value="">— Seleccionar ambiente —</option>
              {environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </FormField>

          <FormField label="Referencia (receta, orden)" error={undefined}>
            <input {...register("reference")} className={iCls(false)} placeholder="REC-2024-001" />
          </FormField>

          <FormField label="Notas" error={undefined}>
            <textarea {...register("notes")} rows={2} className={iCls(false) + " resize-none"} />
          </FormField>

          <button type="submit" disabled={saving}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {saving ? "Procesando salida FEFO..." : "Confirmar Salida"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── AJUSTE FORM ──────────────────────────────────────────────
function AjusteForm({ materials, onSuccess, onError }: {
  materials: import("@/types").Material[];
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { sign: "positive" },
  });

  const sign = watch("sign");
  const selectedMaterialId = watch("material_id");
  const { data: fefoQueue } = useLotsByMaterial(selectedMaterialId ?? "");

  async function onSubmit(values: AdjustmentFormValues) {
    setSaving(true);
    const { error } = await callEdgeFunction("register-adjustment", values as unknown as Record<string, unknown>);
    setSaving(false);
    if (error) { onError(error); return; }
    reset();
    onSuccess("✅ Ajuste registrado correctamente.");
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="h-5 w-5 text-amber-600" />
          <h3 className="font-semibold text-slate-900">Ajuste de Stock</h3>
        </div>
        <p className="text-xs text-slate-500 mb-5">Solo administradores. El ajuste queda registrado para auditoría.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Material *" error={errors.material_id?.message}>
            <select {...register("material_id")} className={iCls(!!errors.material_id)}>
              <option value="">— Seleccionar material —</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
            </select>
          </FormField>

          {fefoQueue && fefoQueue.length > 0 && (
            <FormField label="Lote (requerido si el material tiene vencimiento)" error={errors.lot_id?.message}>
              <select {...register("lot_id")} className={iCls(!!errors.lot_id)}>
                <option value="">— Seleccionar lote —</option>
                {fefoQueue.map((l) => (
                  <option key={l.lot_id} value={l.lot_id}>
                    {l.lot_number} — vence {l.expiry_date} ({l.available_qty} disp.)
                  </option>
                ))}
              </select>
            </FormField>
          )}

          {/* Sign toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(["positive", "negative"] as const).map((s) => (
              <label key={s} className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium cursor-pointer transition-colors",
                sign === s
                  ? s === "positive" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              )}>
                <input type="radio" {...register("sign")} value={s} className="sr-only" />
                {s === "positive" ? <Plus className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {s === "positive" ? "Ajuste positivo" : "Ajuste negativo"}
              </label>
            ))}
          </div>

          <FormField label="Cantidad *" error={errors.quantity?.message}>
            <input type="number" step="0.01" {...register("quantity")} className={iCls(!!errors.quantity)} />
          </FormField>

          <FormField label="Referencia *" error={errors.reference?.message}>
            <input {...register("reference")} className={iCls(!!errors.reference)} placeholder="AUDIT-2024-001" />
          </FormField>

          <FormField label="Detalle del ajuste *" error={errors.notes?.message}>
            <textarea {...register("notes")} rows={3} className={iCls(!!errors.notes) + " resize-none"}
              placeholder="Explicar razón del ajuste (merma, inventario físico, etc.)" />
          </FormField>

          <button type="submit" disabled={saving}
            className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors">
            {saving ? "Registrando ajuste..." : "Confirmar Ajuste"}
          </button>
        </form>
      </div>
    </div>
  );
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function iCls(hasError: boolean) {
  return cn(
    "w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1",
    hasError ? "border-red-300 focus:border-red-500 focus:ring-red-500"
      : "border-slate-300 focus:border-cyan-500 focus:ring-cyan-500"
  );
}
