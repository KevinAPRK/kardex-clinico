"use client";
// app/(dashboard)/ambientes/page.tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Header } from "@/components/layout/Header";
import { PageHeader, LoadingSpinner, EmptyState, AlertBanner } from "@/components/shared";
import { useEnvironments } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { Building2, Pencil, X, MapPin, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Environment } from "@/types";
import { z } from "zod";

const environmentSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio").max(120, "Máximo 120 caracteres"),
  location: z.string().optional().nullable(),
});

type EnvironmentFormValues = z.infer<typeof environmentSchema>;

export default function AmbientesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Environment | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const { data: environments, loading, refetch } = useEnvironments();
  const db = createClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<EnvironmentFormValues>({
    resolver: zodResolver(environmentSchema),
  });

  function openCreate() {
    reset({ name: "", location: "" });
    setEditing(null);
    setFormError(null);
    setFormSuccess(null);
    setShowForm(true);
  }

  function openEdit(environment: Environment) {
    reset({ name: environment.name, location: environment.location ?? "" });
    setEditing(environment);
    setFormError(null);
    setFormSuccess(null);
    setShowForm(true);
  }

  async function onSubmit(values: EnvironmentFormValues) {
    setSaving(true);
    setFormError(null);

    const payload = {
      name: values.name,
      location: values.location || null,
    };

    const { error } = editing
      ? await db.from("environments").update(payload).eq("id", editing.id)
      : await db.from("environments").insert(payload);

    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }

    setFormSuccess(editing ? "Ambiente actualizado." : "Ambiente creado.");
    refetch();
    setTimeout(() => {
      setShowForm(false);
      setFormSuccess(null);
    }, 1200);
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar este ambiente?")) return;
    const { error } = await db.from("environments").update({ is_active: false }).eq("id", id);
    if (error) {
      setFormError(error.message);
      return;
    }
    refetch();
  }

  return (
    <div>
      <Header title="Ambientes" subtitle="Puntos de destino para movimientos de inventario" />
      <div className="p-6">
        <PageHeader
          title="Ambientes"
          description={`${environments?.length ?? 0} registros activos`}
          action={
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 transition-colors"
            >
              <Building2 className="h-4 w-4" /> Nuevo Ambiente
            </button>
          }
        />

        {loading ? <LoadingSpinner /> : !environments?.length ? (
          <EmptyState
            title="Sin ambientes"
            description="Crea el primer ambiente para que aparezca en los movimientos."
            action={
              <button
                onClick={openCreate}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Agregar ambiente
              </button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {environments.map((environment: Environment) => (
              <div key={environment.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-cyan-100 p-2">
                      <Warehouse className="h-4 w-4 text-cyan-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{environment.name}</p>
                      {environment.location && (
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {environment.location}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(environment)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deactivate(environment.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  <p className={cn(
                    "inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                    environment.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  )}>
                    {environment.is_active ? "Activo" : "Inactivo"}
                  </p>
                </div>
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
              <h3 className="font-semibold text-slate-900">
                {editing ? "Editar Ambiente" : "Nuevo Ambiente"}
              </h3>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {formError && <AlertBanner type="error" message={formError} />}
              {formSuccess && <AlertBanner type="success" message={formSuccess} />}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input
                  {...register("name")}
                  placeholder="Emergencia, Almacén Central, UCI..."
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1",
                    errors.name
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-slate-300 focus:border-cyan-500 focus:ring-cyan-500"
                  )}
                />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ubicación</label>
                <input
                  {...register("location")}
                  placeholder="Pabellón A, piso 2, almacén interno..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:border-cyan-500 focus:ring-cyan-500"
                />
              </div>

              <div className="pt-2 pb-6">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60 transition-colors"
                >
                  {saving ? "Guardando..." : editing ? "Actualizar" : "Crear Ambiente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}