"use client";
// app/(dashboard)/movimientos/page.tsx
// Llama Edge Functions. CERO lógica de negocio en este archivo.
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Header } from "@/components/layout/Header";
import { PageHeader, MovementBadge, LoadingSpinner, EmptyState, AlertBanner } from "@/components/shared";
import { useMaterials, useMovements, useEnvironments, useLatestMaterialUnitCost, useStockByMaterial } from "@/lib/hooks";
import { entrySchema, exitSchema, adjustmentSchema, type EntryFormValues, type ExitFormValues, type AdjustmentFormValues } from "@/lib/validators";
import { callEdgeFunction } from "@/lib/supabase/edge";
import { formatDateTime, formatQty } from "@/lib/utils";
import { Plus, ArrowUpRight, ArrowDownRight, SlidersHorizontal, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "historial" | "entrada" | "salida" | "ajuste";

function todayDateValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function dateValueToIso(value?: string) {
  const now = new Date();
  if (!value) return now.toISOString();

  const [year, month, day] = value.split("-").map(Number);
  return new Date(
    year,
    month - 1,
    day,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  ).toISOString();
}

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
      <div className="p-4 sm:p-6">
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
            environments={environments ?? []}
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
  const { data: stockByMaterial } = useStockByMaterial();
  const stockMap = new Map<string, { total_qty: number; unit: string }>(
    (stockByMaterial ?? []).map((item) => [item.material_id, { total_qty: item.total_qty, unit: item.unit }])
  );

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
                <th className="px-5 py-3 text-right font-medium">Cantidad</th>
                <th className="px-5 py-3 text-right font-medium">Saldo real</th>
                <th className="px-5 py-3 text-left font-medium">Servicio</th>
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
                  <td className="px-5 py-3 text-right font-mono font-semibold text-slate-700">
                    {mv.quantity.toLocaleString("es-PE")}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-500 text-xs">
                    {(() => {
                      const stock = stockMap.get(mv.material_id);
                      return stock ? formatQty(stock.total_qty, stock.unit) : "—";
                    })()}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {(mv.environment as { name: string } | null)?.name ?? "—"}
                  </td>
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
  const { control, register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { requires_lot: false, performed_at: todayDateValue(), environment_id: "" },
  });

  const selectedMaterialId = watch("material_id");
  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId);

  async function onSubmit(values: EntryFormValues) {
    setSaving(true);
    const payload: import("@/types").RegisterEntryPayload = {
      material_id: values.material_id,
      quantity: values.quantity,
      unit_cost: values.unit_cost,
      notes: values.notes,
      environment_id: values.environment_id || undefined,
      performed_at: dateValueToIso(values.performed_at),
      lot: undefined,
    };
    const { error } = await callEdgeFunction("register-entry", payload as unknown as Record<string, unknown>);
    setSaving(false);
    if (error) { onError(error); return; }
    reset({ requires_lot: false, performed_at: todayDateValue(), environment_id: "" });
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
          <Controller
            control={control}
            name="material_id"
            render={({ field, fieldState }) => (
              <MaterialSearchSelect
                label="Material *"
                materials={materials}
                value={field.value ?? ""}
                error={fieldState.error?.message}
                placeholder="Escribe para buscar material"
                onChange={(materialId) => {
                  field.onChange(materialId);
                  setValue("requires_lot", false);
                }}
              />
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Cantidad *" error={errors.quantity?.message}>
              <input type="number" step="0.01" {...register("quantity")} className={iCls(!!errors.quantity)}
                placeholder={selectedMaterial ? `en ${selectedMaterial.unit}` : "0"} />
            </FormField>
            <FormField label="Costo unitario" error={undefined}>
              <input type="number" step="0.01" {...register("unit_cost")} className={iCls(false)} placeholder="S/ 0.00" />
            </FormField>
          </div>

          <FormField label="Ambiente *" error={errors.environment_id?.message}>
            <select {...register("environment_id")} className={iCls(!!errors.environment_id)}>
              <option value="">— Seleccionar ambiente —</option>
              {environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </FormField>

          <FormField label="Fecha del movimiento" error={undefined}>
            <input type="date" {...register("performed_at")} className={iCls(false)} />
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
  const { control, register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<ExitFormValues>({
    resolver: zodResolver(exitSchema),
    defaultValues: { performed_at: todayDateValue() },
  });

  const selectedMaterialId = watch("material_id");
  const { data: latestUnitCost } = useLatestMaterialUnitCost(selectedMaterialId);

  useEffect(() => {
    if (!selectedMaterialId) {
      setValue("unit_cost", undefined);
      return;
    }
    if (typeof latestUnitCost === "number") {
      setValue("unit_cost", latestUnitCost);
    }
  }, [selectedMaterialId, latestUnitCost, setValue]);

  async function onSubmit(values: ExitFormValues) {
    setSaving(true);
    const { error } = await callEdgeFunction("register-exit", {
      ...values,
      performed_at: dateValueToIso(values.performed_at),
    } as unknown as Record<string, unknown>);
    setSaving(false);
    if (error) { onError(error); return; }
    reset({ performed_at: todayDateValue() });
    onSuccess("✅ Salida registrada correctamente.");
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
          <ArrowDownRight className="h-5 w-5 text-ev-navy" />
          <h3 className="font-semibold text-slate-900">Registrar Salida</h3>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={control}
            name="material_id"
            render={({ field, fieldState }) => (
              <MaterialSearchSelect
                label="Material *"
                materials={materials}
                value={field.value ?? ""}
                error={fieldState.error?.message}
                placeholder="Escribe para buscar material"
                onChange={field.onChange}
              />
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Cantidad *" error={errors.quantity?.message}>
              <input type="number" step="0.01" {...register("quantity")} className={iCls(!!errors.quantity)} />
            </FormField>
            <FormField label="Costo unitario" error={undefined}>
              <input
                type="number"
                step="0.01"
                readOnly
                {...register("unit_cost")}
                className={cn(iCls(false), "bg-slate-50 text-slate-700 cursor-not-allowed")}
                placeholder="S/ 0.00"
              />
            </FormField>
          </div>

          <FormField label="Ambiente destino *" error={errors.environment_id?.message}>
            <select {...register("environment_id")} className={iCls(!!errors.environment_id)}>
              <option value="">— Seleccionar ambiente —</option>
              {environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </FormField>

          <FormField label="Fecha del movimiento" error={undefined}>
            <input type="date" {...register("performed_at")} className={iCls(false)} />
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
function AjusteForm({ materials, environments, onSuccess, onError }: {
  materials: import("@/types").Material[];
  environments: import("@/types").Environment[];
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const { control, register, handleSubmit, watch, reset, formState: { errors } } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { sign: "positive", performed_at: todayDateValue(), environment_id: "" },
  });

  const sign = watch("sign");

  async function onSubmit(values: AdjustmentFormValues) {
    setSaving(true);
    const { error } = await callEdgeFunction("register-adjustment", {
      ...values,
      environment_id: values.environment_id || undefined,
      performed_at: dateValueToIso(values.performed_at),
    } as unknown as Record<string, unknown>);
    setSaving(false);
    if (error) { onError(error); return; }
    reset({ sign: "positive", performed_at: todayDateValue(), environment_id: "" });
    onSuccess("✅ Ajuste registrado correctamente.");
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="h-5 w-5 text-amber-600" />
          <h3 className="font-semibold text-slate-900">Ajuste de Stock</h3>
        </div>
        <p className="text-xs text-slate-500 mb-5"></p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={control}
            name="material_id"
            render={({ field, fieldState }) => (
              <MaterialSearchSelect
                label="Material *"
                materials={materials}
                value={field.value ?? ""}
                error={fieldState.error?.message}
                placeholder="Escribe para buscar material"
                onChange={field.onChange}
              />
            )}
          />

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

          <FormField label="Ambiente *" error={errors.environment_id?.message}>
            <select {...register("environment_id")} className={iCls(!!errors.environment_id)}>
              <option value="">— Sin ambiente —</option>
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>{environment.name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Fecha del movimiento" error={undefined}>
            <input type="date" {...register("performed_at")} className={iCls(false)} />
          </FormField>

          <FormField label="Detalle del ajuste *" error={errors.notes?.message}>
            <textarea {...register("notes")} rows={3} className={iCls(!!errors.notes) + " resize-none"}
              placeholder="Explicar razón del ajuste" />
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

function MaterialSearchSelect({
  label,
  materials,
  value,
  onChange,
  error,
  placeholder,
}: {
  label: string;
  materials: import("@/types").Material[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedMaterial = useMemo(
    () => materials.find((material) => material.id === value) ?? null,
    [materials, value]
  );

  const filteredMaterials = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return materials;
    return materials.filter((material) =>
      `${material.name} ${material.code}`.toLowerCase().includes(normalizedQuery)
    );
  }, [materials, query]);

  useEffect(() => {
    if (open) return;
    setQuery(selectedMaterial ? `${selectedMaterial.name} (${selectedMaterial.code})` : "");
  }, [open, selectedMaterial]);

  const handleSelect = (material: import("@/types").Material) => {
    onChange(material.id);
    setQuery(`${material.name} (${material.code})`);
    setOpen(false);
  };

  return (
    <FormField label={label} error={error}>
      <div className="relative">
        <input
          type="text"
          value={open ? query : (selectedMaterial ? `${selectedMaterial.name} (${selectedMaterial.code})` : query)}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            if (!nextQuery) onChange("");
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          placeholder={placeholder}
          className={iCls(!!error)}
          autoComplete="off"
        />

        {open && filteredMaterials.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {filteredMaterials.map((material) => (
              <button
                key={material.id}
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSelect(material);
                }}
              >
                <span className="font-medium text-slate-900">{material.name}</span>
                <span className="text-xs text-slate-500">{material.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </FormField>
  );
}

function iCls(hasError: boolean) {
  return cn(
    "w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1",
    hasError ? "border-red-300 focus:border-red-500 focus:ring-red-500"
      : "border-slate-300 focus:border-ev-gold focus:ring-ev-gold"
  );
}
