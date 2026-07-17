"use client";
// app/(dashboard)/categorias/page.tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Header } from "@/components/layout/Header";
import { PageHeader, LoadingSpinner, EmptyState, AlertBanner } from "@/components/shared";
import { useMaterialCategories } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { Tags, Pencil, X, FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MaterialCategory } from "@/types";

const categorySchema = z.object({
  name: z.string().min(2, "La categoría es obligatoria").max(100, "Máximo 100 caracteres"),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

export default function CategoriasPage() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaterialCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const { data: categories, loading, refetch } = useMaterialCategories();
  const db = createClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
  });

  function openCreate() {
    reset({ name: "" });
    setEditing(null);
    setFormError(null);
    setFormSuccess(null);
    setShowForm(true);
  }

  function openEdit(category: MaterialCategory) {
    reset({ name: category.name });
    setEditing(category);
    setFormError(null);
    setFormSuccess(null);
    setShowForm(true);
  }

  async function onSubmit(values: CategoryFormValues) {
    setSaving(true);
    setFormError(null);

    const payload = { name: values.name };

    const { error } = editing
      ? await db.from("material_categories").update(payload).eq("id", editing.id)
      : await db.from("material_categories").insert(payload);

    setSaving(false);
    if (error) {
      setFormError(error.message.includes("unique")
        ? "Ya existe una categoría con ese nombre."
        : error.message);
      return;
    }

    setFormSuccess(editing ? "Categoría actualizada." : "Categoría creada.");
    refetch();
    setTimeout(() => { setShowForm(false); setFormSuccess(null); }, 1200);
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar esta categoría?")) return;
    const { error } = await db.from("material_categories").update({ is_active: false }).eq("id", id);
    if (error) {
      setFormError(error.message);
      return;
    }
    refetch();
  }

  return (
    <div>
      <Header title="Categorías" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Categorías de Productos"
          description={`${categories?.length ?? 0} categorías activas`}
          action={
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-lg bg-ev-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-95 transition-colors"
            >
              <Tags className="h-4 w-4" /> Nueva Categoría
            </button>
          }
        />

        {loading ? <LoadingSpinner /> : !categories?.length ? (
          <EmptyState
            title="Sin categorías"
            description="Crea la primera categoría para usarla en el catálogo de materiales."
            action={
              <button
                onClick={openCreate}
                className="rounded-lg bg-ev-navy px-4 py-2 text-sm font-semibold text-white"
              >
                Agregar categoría
              </button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <div key={category.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-ev-gold/10 p-2">
                      <FolderTree className="h-4 w-4 text-ev-navy" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{category.name}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(category)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deactivate(category.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className={cn(
                  "inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  category.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                )}>
                  {category.is_active ? "Activa" : "Inactiva"}
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
              <h3 className="font-semibold text-slate-900">
                {editing ? "Editar Categoría" : "Nueva Categoría"}
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
                  placeholder="Medicamento, Insumo médico, Reactivo..."
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1",
                    errors.name
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-slate-300 focus:border-ev-gold focus:ring-ev-gold"
                  )}
                />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
              </div>

              <div className="pt-2 pb-6">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-ev-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 transition-colors"
                >
                  {saving ? "Guardando..." : editing ? "Actualizar" : "Crear Categoría"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}