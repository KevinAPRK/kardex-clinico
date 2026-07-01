"use client";
// app/(dashboard)/unidades/page.tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Header } from "@/components/layout/Header";
import { PageHeader, LoadingSpinner, EmptyState, AlertBanner } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { useMaterialUnits } from "@/lib/hooks";
import { Package2, Pencil, Plus, Ruler, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MaterialUnitOption } from "@/types";

const unitSchema = z.object({
  name: z.string().min(1, "La unidad es obligatoria").max(50, "Máximo 50 caracteres"),
});

type UnitFormValues = z.infer<typeof unitSchema>;

export default function UnidadesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaterialUnitOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const { data: units, loading, refetch } = useMaterialUnits();
  const db = createClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
  });

  function openCreate() {
    reset({ name: "" });
    setEditing(null);
    setFormError(null);
    setFormSuccess(null);
    setShowForm(true);
  }

  function openEdit(unit: MaterialUnitOption) {
    reset({ name: unit.name });
    setEditing(unit);
    setFormError(null);
    setFormSuccess(null);
    setShowForm(true);
  }

  async function onSubmit(values: UnitFormValues) {
    setSaving(true);
    setFormError(null);

    const payload = { name: values.name };
    const { error } = editing
      ? await db.from("material_units").update(payload).eq("id", editing.id)
      : await db.from("material_units").insert(payload);

    setSaving(false);

    if (error) {
      setFormError(error.message.includes("unique")
        ? "Ya existe una unidad con ese nombre."
        : error.message);
      return;
    }

    setFormSuccess(editing ? "Unidad actualizada." : "Unidad creada.");
    refetch();
    setTimeout(() => { setShowForm(false); setFormSuccess(null); }, 1200);
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar esta unidad?")) return;
    const { error } = await db.from("material_units").update({ is_active: false }).eq("id", id);
    if (error) {
      setFormError(error.message);
      return;
    }
    refetch();
  }

  return (
    <div>
      <Header title="Unidades" subtitle="Medidas disponibles para el catálogo de materiales" />
      <div className="p-6">
        <PageHeader
          title="Unidades de Medida"
          description={`${units?.length ?? 0} unidades activas`}
          action={
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 transition-colors"
            >
              <Plus className="h-4 w-4" /> Nueva Unidad
            </button>
          }
        />

        {loading ? <LoadingSpinner /> : !units?.length ? (
          <EmptyState
            title="Sin unidades"
            description="Agrega la primera unidad de medida para usarla en materiales."
            action={
              <button onClick={openCreate} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">
                Crear unidad
              </button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {units.map((unit) => (
              <div key={unit.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-cyan-100 p-2">
                      <Ruler className="h-4 w-4 text-cyan-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{unit.name}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(unit)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deactivate(unit.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className={cn(
                  "inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  unit.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                )}>
                  {unit.is_active ? "Activa" : "Inactiva"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative ml-auto flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Package2 className="h-5 w-5 text-cyan-600" />
                <h3 className="font-semibold text-slate-900">{editing ? "Editar Unidad" : "Nueva Unidad"}</h3>
              </div>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {formError && <AlertBanner type="error" message={formError} />}
              {formSuccess && <AlertBanner type="success" message={formSuccess} />}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input
                  {...register("name")}
                  placeholder="Unidad, Caja, mL, Frasco..."
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1",
                    errors.name
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-slate-300 focus:border-cyan-500 focus:ring-cyan-500"
                  )}
                />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
              </div>

              <div className="pt-2 pb-6">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60 transition-colors"
                >
                  {saving ? "Guardando..." : editing ? "Actualizar" : "Crear Unidad"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}