"use client";
// app/(dashboard)/proveedores/page.tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Header } from "@/components/layout/Header";
import { PageHeader, LoadingSpinner, EmptyState, AlertBanner } from "@/components/shared";
import { useSuppliers } from "@/lib/hooks";
import { supplierSchema, type SupplierFormValues } from "@/lib/validators";
import { createClient } from "@/lib/supabase/client";
import { Plus, Pencil, X, Truck, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Supplier } from "@/types";

export default function ProveedoresPage() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const { data: suppliers, loading, refetch } = useSuppliers();
  const db = createClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
  });

  function openCreate() {
    reset({});
    setEditing(null);
    setFormError(null);
    setFormSuccess(null);
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    reset({
      name: s.name, ruc: s.ruc ?? "", contact_name: s.contact_name ?? "",
      phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "",
    });
    setEditing(s);
    setFormError(null);
    setFormSuccess(null);
    setShowForm(true);
  }

  async function onSubmit(values: SupplierFormValues) {
    setSaving(true);
    setFormError(null);
    const payload = {
      name: values.name,
      ruc: values.ruc || null,
      contact_name: values.contact_name || null,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
    };
    const { error } = editing
      ? await db.from("suppliers").update(payload).eq("id", editing.id)
      : await db.from("suppliers").insert(payload);
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setFormSuccess(editing ? "Proveedor actualizado." : "Proveedor creado.");
    refetch();
    setTimeout(() => { setShowForm(false); setFormSuccess(null); }, 1200);
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar este proveedor?")) return;
    await db.from("suppliers").update({ is_active: false }).eq("id", id);
    refetch();
  }

  return (
    <div>
      <Header title="Proveedores" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Proveedores"
          description={`${suppliers?.length ?? 0} proveedores activos`}
          action={
            <button onClick={openCreate}
              className="flex items-center gap-2 rounded-lg bg-ev-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-95 transition-colors">
              <Plus className="h-4 w-4" /> Nuevo Proveedor
            </button>
          }
        />

        {loading ? <LoadingSpinner /> : !suppliers?.length ? (
            <EmptyState
            title="Sin proveedores"
            description="Agrega el primer proveedor de insumos."
            action={<button onClick={openCreate} className="rounded-lg bg-ev-navy px-4 py-2 text-sm font-semibold text-white">Agregar proveedor</button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((s: Supplier) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-ev-gold/10 p-2">
                      <Truck className="h-4 w-4 text-ev-navy" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{s.name}</p>
                      {s.ruc && <p className="text-xs text-slate-400 font-mono">RUC: {s.ruc}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(s)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deactivate(s.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  {s.contact_name && <p className="font-medium text-slate-700">{s.contact_name}</p>}
                  {s.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" /> {s.phone}
                    </div>
                  )}
                  {s.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3" /> {s.email}
                    </div>
                  )}
                  {s.address && <p className="text-slate-400 mt-1">{s.address}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drawer */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative ml-auto flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="font-semibold text-slate-900">{editing ? "Editar Proveedor" : "Nuevo Proveedor"}</h3>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {formError && <AlertBanner type="error" message={formError} />}
              {formSuccess && <AlertBanner type="success" message={formSuccess} />}

              {([
                { key: "name",         label: "Nombre *",          placeholder: "Distribuidora Médica SAC" },
                { key: "ruc",          label: "RUC",               placeholder: "20123456789" },
                { key: "contact_name", label: "Contacto",          placeholder: "Juan Pérez" },
                { key: "phone",        label: "Teléfono",          placeholder: "+51 999 888 777" },
                { key: "email",        label: "Email",             placeholder: "ventas@proveedor.com" },
                { key: "address",      label: "Dirección",         placeholder: "Av. Principal 123" },
              ] as const).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                  <input
                    {...register(key)}
                    placeholder={placeholder}
                      className={cn(
                      "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1",
                      errors[key]
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                        : "border-slate-300 focus:border-ev-gold focus:ring-ev-gold"
                    )}
                  />
                  {errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]?.message}</p>}
                </div>
              ))}

              <div className="pt-2 pb-6">
                <button type="submit" disabled={saving}
                  className="w-full rounded-lg bg-ev-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 transition-colors">
                  {saving ? "Guardando..." : editing ? "Actualizar" : "Crear Proveedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
