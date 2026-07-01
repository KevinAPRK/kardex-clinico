"use client";
// app/(dashboard)/dashboard/page.tsx
import { Header } from "@/components/layout/Header";
import { StatCard, MovementBadge, ExpiryBadge, LoadingSpinner, EmptyState } from "@/components/shared";
import { useDashboardSummary, useStockAlerts, useMovements } from "@/lib/hooks";
import { formatDateTime, formatQty, expiryStatus, daysUntilExpiry } from "@/lib/utils";
import {
  Package, AlertTriangle, ArrowLeftRight, TrendingDown,
  Clock, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import Link from "next/link";
import type { StockAlert } from "@/types";

export default function DashboardPage() {
  const { data: summary, loading: summaryLoading } = useDashboardSummary();
  const { data: alerts, loading: alertsLoading } = useStockAlerts();
  const { data: movements, loading: movementsLoading } = useMovements({ limit: 8 });

  const lowStockAlerts = alerts?.filter((a) => a.low_stock) ?? [];
  const expiringAlerts = alerts?.filter((a) => a.expiring_soon) ?? [];

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle="Resumen general del inventario clínico"
      />

      <div className="p-4 space-y-6 sm:p-6">
        {/* ── Stat Cards ── */}
        {summaryLoading ? (
          <LoadingSpinner text="Cargando resumen..." />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Stock bajo mínimo"
              value={summary?.low_stock_count ?? 0}
              icon={AlertTriangle}
              iconColor="text-red-500"
              alert={(summary?.low_stock_count ?? 0) > 0}
            />
            <StatCard
              label="Próximos a vencer"
              value={summary?.expiring_soon_count ?? 0}
              icon={Clock}
              iconColor="text-amber-500"
              alert={(summary?.expiring_soon_count ?? 0) > 0}
            />
            <StatCard
              label="Entradas (7 días)"
              value={summary?.entries_7d ?? 0}
              icon={ArrowUpRight}
              iconColor="text-emerald-500"
            />
            <StatCard
              label="Salidas (7 días)"
              value={summary?.exits_7d ?? 0}
              icon={ArrowDownRight}
              iconColor="text-blue-500"
            />
          </div>
        )}

        {/* ── Alerts Grid ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Stock bajo */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold text-slate-900">Stock bajo mínimo</h3>
              </div>
              <Link href="/materiales" className="text-xs text-ev-gold hover:underline">
                Ver materiales →
              </Link>
            </div>
            <div className="divide-y divide-slate-50">
              {alertsLoading ? (
                <LoadingSpinner />
              ) : lowStockAlerts.length === 0 ? (
                <EmptyState title="Sin alertas de stock" description="Todos los materiales tienen stock suficiente." />
              ) : (
                lowStockAlerts.slice(0, 5).map((alert: StockAlert) => (
                  <div key={alert.material_id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{alert.material_name}</p>
                      <p className="text-xs text-slate-500 font-mono">{alert.material_code}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">
                        {formatQty(alert.total_qty, alert.unit)}
                      </p>
                      <p className="text-xs text-slate-400">
                        mín: {formatQty(alert.min_stock, alert.unit)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Próximos a vencer */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900">Próximos a vencer</h3>
              </div>
              <Link href="/reportes" className="text-xs text-ev-gold hover:underline">
                Ver reportes →
              </Link>
            </div>
            <div className="divide-y divide-slate-50">
              {alertsLoading ? (
                <LoadingSpinner />
              ) : expiringAlerts.length === 0 ? (
                <EmptyState title="Sin vencimientos próximos" description="No hay materiales que venzan en los próximos 30 días." />
              ) : (
                expiringAlerts.slice(0, 5).map((alert: StockAlert) => {
                  const status = alert.nearest_expiry
                    ? expiryStatus(alert.nearest_expiry)
                    : "ok";
                  const days = alert.nearest_expiry
                    ? daysUntilExpiry(alert.nearest_expiry)
                    : null;
                  return (
                    <div key={alert.material_id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{alert.material_name}</p>
                        <p className="text-xs text-slate-500">
                          {days !== null ? `${days} días para vencer` : "—"}
                        </p>
                      </div>
                      <ExpiryBadge status={status} />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Recent Movements ── */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">Últimos movimientos</h3>
            </div>
            <Link href="/movimientos" className="text-xs text-ev-gold hover:underline">
              Ver todos →
            </Link>
          </div>

          {movementsLoading ? (
            <LoadingSpinner />
          ) : !movements?.length ? (
            <EmptyState title="Sin movimientos recientes" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left font-medium">Tipo</th>
                    <th className="px-5 py-3 text-left font-medium">Material</th>
                    <th className="px-5 py-3 text-right font-medium">Cantidad</th>
                    <th className="px-5 py-3 text-left font-medium">Ambiente</th>
                    <th className="px-5 py-3 text-left font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {movements.map((mv) => (
                    <tr key={mv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <MovementBadge type={mv.type} />
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-medium text-slate-900">
                          {(mv.material as { name: string })?.name ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-slate-700">
                        {mv.quantity.toLocaleString("es-PE")}
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {(mv.environment as { name: string } | null)?.name ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-400 text-xs">
                        {formatDateTime(mv.performed_at)}
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
