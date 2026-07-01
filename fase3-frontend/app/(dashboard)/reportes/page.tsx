"use client";
// app/(dashboard)/reportes/page.tsx
// Datos desde vistas Supabase. Export PDF + Excel client-side.
import { useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { PageHeader, MovementBadge, LoadingSpinner, EmptyState } from "@/components/shared";
import { useMaterials, useEnvironments, useMovements } from "@/lib/hooks";
import { periodDates, formatDateTime, movementLabel } from "@/lib/utils";
import { BarChart2, Download, FileText, Table2, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Movement } from "@/types";

type Period = "week" | "month" | "quarter";
type TypeFilter = "all" | "entry" | "exit" | "adjustment";

export default function ReportesPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [materialFilter, setMaterialFilter] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const { data: materials } = useMaterials();
  const { data: environments } = useEnvironments();

  const dates = periodDates(period);
  const { data: movements, loading } = useMovements({
    type: typeFilter !== "all" ? typeFilter : undefined,
    material_id: materialFilter || undefined,
    environment_id: environmentFilter || undefined,
    from: dates.from,
    to: dates.to,
    limit: 500,
  });

  // ── Summary stats ────────────────────────────────────────
  const totalEntries = movements?.filter((m) => m.type === "entry").reduce((s, m) => s + m.quantity, 0) ?? 0;
  const totalExits   = movements?.filter((m) => m.type === "exit").reduce((s, m) => s + m.quantity, 0) ?? 0;
  const totalValue   = movements?.reduce((s, m) => s + (m.unit_cost ?? 0) * m.quantity, 0) ?? 0;

  // ── Excel export via SheetJS ─────────────────────────────
  const exportExcel = useCallback(async () => {
    if (!movements?.length) return;
    setExporting("excel");
    try {
      const XLSX = await import("xlsx");
      const rows = movements.map((m: Movement) => ({
        "Fecha": formatDateTime(m.performed_at),
        "Tipo": movementLabel(m.type),
        "Material": (m.material as { name: string })?.name ?? "—",
        "Código": (m.material as { code: string })?.code ?? "—",
        "Lote": (m.lot as { lot_number: string } | null)?.lot_number ?? "—",
        "Cantidad": m.quantity,
        "Costo Unit.": m.unit_cost ?? 0,
        "Total": (m.unit_cost ?? 0) * m.quantity,
        "Ambiente": (m.environment as { name: string } | null)?.name ?? "—",
        "Referencia": m.reference ?? "—",
        "Realizado por": (m.performer as { full_name: string })?.full_name ?? "—",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
      XLSX.writeFile(wb, `kardex-reporte-${period}-${new Date().toISOString().split("T")[0]}.xlsx`);
    } finally {
      setExporting(null);
    }
  }, [movements, period]);

  // ── PDF export via print ─────────────────────────────────
  const exportPdf = useCallback(() => {
    setExporting("pdf");
    // Open printable view in new tab — no backend needed
    const content = movements?.map((m: Movement) =>
      `<tr>
        <td>${formatDateTime(m.performed_at)}</td>
        <td>${movementLabel(m.type)}</td>
        <td>${(m.material as { name: string })?.name ?? "—"}</td>
        <td>${m.quantity}</td>
        <td>${(m.environment as { name: string } | null)?.name ?? "—"}</td>
        <td>${m.reference ?? "—"}</td>
      </tr>`
    ).join("") ?? "";

    const html = `<!DOCTYPE html><html><head>
      <title>Reporte Kardex</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
        h1{font-size:16px;margin-bottom:4px}
        p{color:#666;margin-bottom:16px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f1f5f9;font-weight:600}
        tr:nth-child(even){background:#f8fafc}
        @media print{button{display:none}}
      </style>
    </head><body>
      <h1>Reporte de Movimientos — Kardex Clínico</h1>
      <p>Período: ${period === "week" ? "Última semana" : period === "month" ? "Último mes" : "Último trimestre"} · Generado: ${new Date().toLocaleString("es-PE")}</p>
      <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;background:#0891b2;color:white;border:none;border-radius:6px;cursor:pointer">Imprimir / Guardar PDF</button>
      <table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Material</th><th>Cantidad</th><th>Ambiente</th><th>Referencia</th></tr></thead>
        <tbody>${content}</tbody>
      </table>
    </body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setExporting(null);
  }, [movements, period]);

  const periodLabels: Record<Period, string> = {
    week: "Última semana", month: "Último mes", quarter: "Último trimestre",
  };

  return (
    <div>
      <Header title="Reportes" subtitle="Análisis y exportación de datos de inventario" />
      <div className="p-6">
        <PageHeader
          title="Reportes de Movimientos"
          action={
            <div className="flex gap-2">
              <button
                onClick={exportPdf}
                disabled={!movements?.length || exporting !== null}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                <FileText className="h-4 w-4 text-red-500" />
                {exporting === "pdf" ? "Generando..." : "Exportar PDF"}
              </button>
              <button
                onClick={exportExcel}
                disabled={!movements?.length || exporting !== null}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                <Table2 className="h-4 w-4 text-emerald-600" />
                {exporting === "excel" ? "Generando..." : "Exportar Excel"}
              </button>
            </div>
          }
        />

        {/* Filter bar */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 mb-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {/* Period */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                <Calendar className="inline h-3 w-3 mr-1" />Período
              </label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {(["week", "month", "quarter"] as Period[]).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-medium transition-colors",
                      period === p ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                    )}>
                    {p === "week" ? "7d" : p === "month" ? "30d" : "90d"}
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de movimiento</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none">
                <option value="all">Todos</option>
                <option value="entry">Entradas</option>
                <option value="exit">Salidas</option>
                <option value="adjustment">Ajustes</option>
              </select>
            </div>

            {/* Material */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Material</label>
              <select value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none">
                <option value="">Todos los materiales</option>
                {materials?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            {/* Environment */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ambiente</label>
              <select value={environmentFilter} onChange={(e) => setEnvironmentFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none">
                <option value="">Todos los ambientes</option>
                {environments?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        {movements && movements.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Movimientos</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{movements.length}</p>
              <p className="text-xs text-slate-400">{periodLabels[period]}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-600 font-medium">Total entradas</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{totalEntries.toLocaleString("es-PE")}</p>
              <p className="text-xs text-emerald-500">unidades</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 shadow-sm p-4">
              <p className="text-xs uppercase tracking-wide text-blue-600 font-medium">Total salidas</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{totalExits.toLocaleString("es-PE")}</p>
              <p className="text-xs text-blue-500">unidades · S/ {totalValue.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        )}

        {/* Data table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <BarChart2 className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">
              {movements?.length ?? 0} movimientos · {periodLabels[period]}
            </h3>
            {movements?.length === 500 && (
              <span className="ml-auto text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                Mostrando máx. 500 — usa filtros para afinar
              </span>
            )}
          </div>

          {loading ? <LoadingSpinner /> : !movements?.length ? (
            <EmptyState
              title="Sin datos"
              description="No hay movimientos para los filtros seleccionados."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium">Material</th>
                    <th className="px-4 py-3 text-left font-medium">Lote</th>
                    <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                    <th className="px-4 py-3 text-right font-medium">Valor</th>
                    <th className="px-4 py-3 text-left font-medium">Ambiente</th>
                    <th className="px-4 py-3 text-left font-medium">Fecha</th>
                    <th className="px-4 py-3 text-left font-medium">Registrado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {movements.map((mv: Movement) => (
                    <tr key={mv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3"><MovementBadge type={mv.type} /></td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-900">{(mv.material as { name: string })?.name ?? "—"}</p>
                          <p className="text-xs font-mono text-slate-400">{(mv.material as { code: string })?.code ?? ""}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {(mv.lot as { lot_number: string } | null)?.lot_number ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                        {mv.quantity.toLocaleString("es-PE")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">
                        {mv.unit_cost ? `S/ ${((mv.unit_cost) * mv.quantity).toLocaleString("es-PE", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {(mv.environment as { name: string } | null)?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {formatDateTime(mv.performed_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {(mv.performer as { full_name: string })?.full_name ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
