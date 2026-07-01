"use client";
// app/(dashboard)/lotes/page.tsx — READ ONLY
import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { PageHeader, ExpiryBadge, LoadingSpinner, EmptyState } from "@/components/shared";
import { useMaterials, useAllLots } from "@/lib/hooks";
import { formatDate, daysUntilExpiry, expiryStatus } from "@/lib/utils";
import { Search, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lot } from "@/types";

export default function LotesPage() {
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [search, setSearch] = useState("");

  const { data: materials } = useMaterials();
  const { data: lots, loading } = useAllLots(selectedMaterialId || undefined);

  // Only materials with requires_expiry
  const expiryMaterials = materials?.filter((m) => m.requires_expiry) ?? [];

  const filtered = lots?.filter((l: Lot) => {
    if (!search) return true;
    return l.lot_number.toLowerCase().includes(search.toLowerCase());
  }) ?? [];

  // Group by status for quick count
  const expired  = filtered.filter((l) => daysUntilExpiry(l.expiry_date) < 0);
  const critical = filtered.filter((l) => { const d = daysUntilExpiry(l.expiry_date); return d >= 0 && d <= 7; });
  const warning  = filtered.filter((l) => { const d = daysUntilExpiry(l.expiry_date); return d > 7 && d <= 30; });

  return (
    <div>
      <Header title="Lotes" subtitle="Trazabilidad y control de vencimientos" />
      <div className="p-6">
        <PageHeader
          title="Control de Lotes"
          description="Vista de sólo lectura — orden FEFO (vencimiento más próximo primero)"
        />

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Vencidos con stock",    count: expired.length,  color: "border-red-200 bg-red-50 text-red-700" },
            { label: "Vencen en 7 días",      count: critical.length, color: "border-orange-200 bg-orange-50 text-orange-700" },
            { label: "Vencen en 30 días",     count: warning.length,  color: "border-amber-200 bg-amber-50 text-amber-700" },
          ].map(({ label, count, color }) => (
            <div key={label} className={cn("rounded-xl border p-4 text-center", color)}>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <select
            value={selectedMaterialId}
            onChange={(e) => setSelectedMaterialId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
          >
            <option value="">Todos los materiales</option>
            {expiryMaterials.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nº de lote..."
              className="rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loading ? <LoadingSpinner /> : !filtered.length ? (
            <EmptyState
              title="Sin lotes"
              description={selectedMaterialId ? "Este material no tiene lotes registrados." : "No hay lotes con vencimiento registrados."}
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Nº Lote</th>
                  <th className="px-5 py-3 text-left font-medium">Material</th>
                  <th className="px-5 py-3 text-left font-medium">Vencimiento</th>
                  <th className="px-5 py-3 text-center font-medium">Estado</th>
                  <th className="px-5 py-3 text-center font-medium">Días restantes</th>
                  <th className="px-5 py-3 text-right font-medium">Qty inicial</th>
                  <th className="px-5 py-3 text-left font-medium">Recibido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((lot: Lot) => {
                  const status = expiryStatus(lot.expiry_date);
                  const days = daysUntilExpiry(lot.expiry_date);
                  const material = materials?.find((m) => m.id === lot.material_id);
                  return (
                    <tr key={lot.id} className={cn(
                      "hover:bg-slate-50 transition-colors",
                      status === "expired" && "bg-red-50/50"
                    )}>
                      <td className="px-5 py-3 font-mono text-sm font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <Archive className="h-3.5 w-3.5 text-slate-400" />
                          {lot.lot_number}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{material?.name ?? lot.material_id}</td>
                      <td className="px-5 py-3 font-mono text-slate-600">{formatDate(lot.expiry_date)}</td>
                      <td className="px-5 py-3 text-center">
                        <ExpiryBadge status={status} />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={cn(
                          "text-sm font-bold",
                          days < 0 ? "text-red-600" : days <= 7 ? "text-orange-600" : days <= 30 ? "text-amber-600" : "text-slate-700"
                        )}>
                          {days < 0 ? `${Math.abs(days)}d vencido` : `${days}d`}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-slate-700">{lot.initial_qty.toLocaleString("es-PE")}</td>
                      <td className="px-5 py-3 text-slate-500 text-xs">{formatDate(lot.received_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
