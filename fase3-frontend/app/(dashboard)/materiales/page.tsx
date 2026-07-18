"use client";
// app/(dashboard)/materiales/page.tsx
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Header } from "@/components/layout/Header";
import { PageHeader, LoadingSpinner, EmptyState, AlertBanner } from "@/components/shared";
import { useMaterials, useSuppliers, useMaterialCategories, useMaterialUnits } from "@/lib/hooks";
import { materialSchema, type MaterialFormValues } from "@/lib/validators";
import { createClient } from "@/lib/supabase/client";
import { Plus, Pencil, X, Search, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Material } from "@/types";

export default function MaterialesPage() {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const { data: materials, loading, refetch } = useMaterials(search || undefined);
  const { data: suppliers } = useSuppliers();
  const { data: categories } = useMaterialCategories();
  const { data: units } = useMaterialUnits();
  const db = createClient();

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return materials ?? [];
    return (materials ?? []).filter((material) => {
      const haystack = [material.code, material.name, material.category ?? "", material.unit]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [materials, search]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MaterialFormValues>({
    resolver: zodResolver(materialSchema),
    defaultValues: { requires_expiry: false, min_stock: 0, unit: "" },
  });

  function openCreate() {
    reset({ requires_expiry: false, min_stock: 0, unit: "" });
    setEditing(null);
    setFormError(null);
    setFormSuccess(null);
    setShowForm(true);
  }

  function openEdit(material: Material) {
    reset({
      name: material.name,
      description: material.description ?? "",
      category: material.category ?? "",
      unit: material.unit,
      requires_expiry: false,
      min_stock: material.min_stock,
      default_supplier_id: material.default_supplier_id,
    });
    setEditing(material);
    setFormError(null);
    setFormSuccess(null);
    setShowForm(true);
  }

  async function onSubmit(values: MaterialFormValues) {
    setSaving(true);
    setFormError(null);

    const payload = {
      ...(editing ? {} : { code: generateMaterialCode(values.name) }),
      name: values.name,
      description: values.description || null,
      category: values.category || null,
      unit: values.unit,
      requires_expiry: false,
      min_stock: values.min_stock,
      default_supplier_id: values.default_supplier_id || null,
    };

    const { error } = editing
      ? await db.from("materials").update(payload).eq("id", editing.id)
      : await db.from("materials").insert(payload);

    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setFormSuccess(editing ? "Material actualizado." : "Material creado.");
    refetch();
    setTimeout(() => { setShowForm(false); setFormSuccess(null); }, 1200);
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar este material?")) return;
    await db.from("materials").update({ is_active: false }).eq("id", id);
    refetch();
  }

  return (
    <div>
      <Header title="Materiales" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Catálogo de Materiales"
          description={`${materials?.length ?? 0} materiales activos`}
          action={
            <button onClick={openCreate}
              className="flex items-center gap-2 rounded-lg bg-ev-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-95 transition-colors">
              <Plus className="h-4 w-4" /> Nuevo Material
            </button>
          }
        />

        {/* Search */}
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchOpen(true);
            }}
            placeholder="Buscar por nombre..."
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-ev-gold focus:outline-none focus:ring-1 focus:ring-ev-gold"
          />
          {searchOpen && search.trim() && (
            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {searchResults.length ? (
                searchResults.map((material) => (
                  <button
                    key={material.id}
                    type="button"
                    className="flex w-full flex-col items-start border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setSearch(material.name);
                      setSearchOpen(false);
                    }}
                  >
                    <span className="font-medium text-slate-900">{material.name}</span>
                    <span className="text-xs text-slate-500">
                      {material.code} {material.category ? `· ${material.category}` : ""} · {material.unit}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500">Sin coincidencias</div>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <LoadingSpinner />
          ) : !materials?.length ? (
            <EmptyState
              title="Sin materiales"
              description="Crea el primer material del catálogo."
              action={<button onClick={openCreate} className="rounded-lg bg-ev-navy px-4 py-2 text-sm font-semibold text-white">Crear material</button>}
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr className="text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-medium">Código</th>
                  <th className="px-5 py-3 text-left font-medium">Nombre</th>
                  <th className="px-5 py-3 text-left font-medium">Categoría</th>
                  <th className="px-5 py-3 text-left font-medium">Unidad</th>
                  <th className="px-5 py-3 text-right font-medium">Stock mín.</th>
                  <th className="px-5 py-3 text-center font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {materials.map((m: Material) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{m.code}</td>
                    <td className="px-5 py-3 font-medium text-slate-900">{m.name}</td>
                    <td className="px-5 py-3 text-slate-500">{m.category ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-500 uppercase text-xs">{m.unit}</td>
                    <td className="px-5 py-3 text-right font-mono text-slate-700">{m.min_stock}</td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(m)}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deactivate(m.id)}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Drawer / Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-ev-gold" />
                <h3 className="font-semibold text-slate-900">
                  {editing ? "Editar Material" : "Nuevo Material"}
                </h3>
              </div>
              <button onClick={() => setShowForm(false)} className="rounded p-1.5 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {formError && <AlertBanner type="error" message={formError} />}
              {formSuccess && <AlertBanner type="success" message={formSuccess} />}

              <Field label="Nombre *" error={errors.name?.message}>
                <input {...register("name")} placeholder="Amoxicilina 500mg"
                  className={inputCls(!!errors.name)} />
              </Field>

              <Field label="Descripción" error={errors.description?.message}>
                <textarea {...register("description")} rows={2}
                  className={inputCls(false) + " resize-none"} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoría" error={errors.category?.message}>
                  <select {...register("category")} className={inputCls(false)}>
                    <option value="">— Seleccionar —</option>
                    {(categories ?? []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </Field>

                <Field label="Unidad *" error={errors.unit?.message}>
                  <select {...register("unit")} className={inputCls(!!errors.unit)}>
                    <option value="">— Seleccionar —</option>
                    {(units ?? []).map((unit) => (
                      <option key={unit.id} value={unit.name}>{unit.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Stock mínimo" error={errors.min_stock?.message}>
                <input type="number" step="1" min="0" {...register("min_stock")}
                  className={inputCls(!!errors.min_stock)} />
              </Field>

              <Field label="Proveedor por defecto" error={undefined}>
                <select {...register("default_supplier_id")} className={inputCls(false)}>
                  <option value="">— Ninguno —</option>
                  {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>

              <div className="pt-2 pb-6">
                <button type="submit" disabled={saving}
                  className="w-full rounded-lg bg-ev-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 transition-colors">
                  {saving ? "Guardando..." : editing ? "Actualizar Material" : "Crear Material"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return cn(
    "w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1",
    hasError
      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
      : "border-slate-300 focus:border-ev-gold focus:ring-ev-gold"
  );
}

function generateMaterialCode(name: string) {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "MAT";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${suffix}`.slice(0, 50);
}
