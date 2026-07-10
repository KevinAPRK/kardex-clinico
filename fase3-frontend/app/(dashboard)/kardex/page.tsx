"use client";
// app/(dashboard)/kardex/page.tsx
// Consume get_kardex() SQL function. CERO cálculos aquí.
import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { PageHeader, MovementBadge, LoadingSpinner, EmptyState } from "@/components/shared";
import { useMaterials, useKardex } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";
import { ClipboardList, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KardexRow } from "@/types";

export default function KardexPage() {
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: materials } = useMaterials();
  const selectedMaterial = materials?.find((m) => m.id === selectedMaterialId);
  const { data: rows, loading } = useKardex(
    selectedMaterialId,
    from ? new Date(from).toISOString() : undefined,
    to ? new Date(to + "T23:59:59").toISOString() : undefined
  );

  const totalIn  = rows?.reduce((s, r) => s + r.quantity_in, 0) ?? 0;
  const totalOut = rows?.reduce((s, r) => s + r.quantity_out, 0) ?? 0;
  const currentBalance = rows?.[rows.length - 1]?.running_total ?? 0;

  return (
    <div>
      <Header title="Kardex" subtitle="Historial de movimientos con saldo corrido por material" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Kardex de Material" description="Datos provistos por get_kardex() — inmutables" />

        {/* Filters */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 mb-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Material</label>
              <select
                value={selectedMaterialId}
                onChange={(e) => setSelectedMaterialId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ev-gold focus:outline-none"
              >
                <option value="">— Seleccionar material —</option>
                {materials?.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Desde</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ev-gold focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Hasta</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ev-gold focus:outline-none" />
            </div>
          </div>
        </div>

        {!selectedMaterialId ? (
          <EmptyState
            title="Selecciona un material"
            description="Elige un material para ver su Kardex completo con saldo corrido."
          />
        ) : loading ? (
          <LoadingSpinner text="Cargando Kardex..." />
        ) : (
          <>
            {/* Summary cards */}
            {rows && rows.length > 0 && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                <SummaryCard label="Material" value={selectedMaterial?.name ?? "—"} sub={selectedMaterial?.code} />
                <SummaryCard label="Total entradas" value={totalIn.toLocaleString("es-PE")} sub={selectedMaterial?.unit} color="text-emerald-700" />
                <SummaryCard label="Total salidas" value={totalOut.toLocaleString("es-PE")} sub={selectedMaterial?.unit} color="text-blue-700" />
                <SummaryCard
                  label="Saldo actual"
                  value={currentBalance.toLocaleString("es-PE")}
                  sub={selectedMaterial?.unit}
                  color={currentBalance <= (selectedMaterial?.min_stock ?? 0) ? "text-red-700" : "text-slate-900"}
                />
              </div>
            )}

            {/* Kardex table */}
            {!rows?.length ? (
              <EmptyState title="Sin movimientos" description="No hay movimientos para este material en el período seleccionado." />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                  <ClipboardList className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Kardex — {rows.length} movimientos
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Fecha / Hora</th>
                        <th className="px-4 py-3 text-left font-medium">Tipo</th>
                        <th className="px-4 py-3 text-left font-medium">Ambiente</th>
                        <th className="px-4 py-3 text-right font-medium text-emerald-700">Entrada</th>
                        <th className="px-4 py-3 text-right font-medium text-blue-700">Salida</th>
                        <th className="px-4 py-3 text-right font-medium">Saldo</th>
                        <th className="px-4 py-3 text-left font-medium">Registrado por</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rows.map((row: KardexRow, idx: number) => {
                        const prevBalance = idx > 0 ? rows[idx - 1].running_total : 0;
                        const delta = row.running_total - prevBalance;
                        return (
                          <tr key={row.movement_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                              {formatDateTime(row.performed_at)}
                            </td>
                            <td className="px-4 py-3">
                              <MovementBadge type={row.type} />
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              {row.environment ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {row.quantity_in > 0 ? (
                                <span className="font-mono font-semibold text-emerald-700">
                                  +{row.quantity_in.toLocaleString("es-PE")}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {row.quantity_out > 0 ? (
                                <span className="font-mono font-semibold text-blue-700">
                                  -{row.quantity_out.toLocaleString("es-PE")}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {delta > 0 ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                                  : delta < 0 ? <TrendingDown className="h-3 w-3 text-blue-500" />
                                  : <Minus className="h-3 w-3 text-slate-400" />}
                                <span className={cn(
                                  "font-mono font-bold",
                                  row.running_total <= (selectedMaterial?.min_stock ?? 0)
                                    ? "text-red-600" : "text-slate-900"
                                )}>
                                  {row.running_total.toLocaleString("es-PE")}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{row.performed_by}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color = "text-slate-900" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={cn("text-xl font-bold mt-1 truncate", color)}>{value}</p>
      {sub && <p className="text-xs text-slate-400 uppercase mt-0.5">{sub}</p>}
    </div>
  );
}
