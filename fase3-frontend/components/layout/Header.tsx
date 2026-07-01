"use client";
// components/layout/Header.tsx
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Menu, TriangleAlert, User } from "lucide-react";
import { useStockAlerts } from "@/lib/hooks";
import { useDashboardSidebar } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { daysUntilExpiry, expiryStatus, formatQty } from "@/lib/utils";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { data: alerts } = useStockAlerts();
  const alertCount = alerts?.length ?? 0;
  const { openMobileSidebar } = useDashboardSidebar();
  const router = useRouter();
  const db = createClient();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const bellMenuRef = useRef<HTMLDivElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [bellMenuOpen, setBellMenuOpen] = useState(false);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;

      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }

      if (bellMenuRef.current && !bellMenuRef.current.contains(target)) {
        setBellMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  async function handleLogout() {
    await db.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={openMobileSidebar}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 self-end lg:self-auto">
        {/* Alert bell */}
        <div className="relative" ref={bellMenuRef}>
          <button
            className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
            type="button"
            onClick={() => setBellMenuOpen((value) => !value)}
            aria-label="Ver notificaciones"
          >
            <Bell className="h-5 w-5" />
            {alertCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {alertCount > 9 ? "9+" : alertCount}
              </span>
            )}
          </button>

          {bellMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Notificaciones</p>
                  <p className="text-xs text-slate-500">Alertas de stock y vencimiento</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  {alertCount} activas
                </span>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {alerts?.length ? (
                  alerts.slice(0, 5).map((alert) => {
                    const expired = alert.nearest_expiry
                      ? expiryStatus(alert.nearest_expiry) === "expired"
                      : false;
                    const critical = alert.nearest_expiry
                      ? expiryStatus(alert.nearest_expiry) === "critical"
                      : false;
                    const days = alert.nearest_expiry ? daysUntilExpiry(alert.nearest_expiry) : null;

                    return (
                      <div key={alert.material_id} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className={"mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full " + (expired || critical ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500")}>
                            <TriangleAlert className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{alert.material_name}</p>
                            <p className="text-xs text-slate-500 font-mono">{alert.material_code}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              {formatQty(alert.total_qty, alert.unit)} · mín. {formatQty(alert.min_stock, alert.unit)}
                            </p>
                            <p className={"mt-1 text-xs font-medium " + (expired ? "text-red-600" : critical ? "text-amber-600" : "text-slate-500")}>
                              {alert.nearest_expiry
                                ? days !== null
                                  ? `${days} días para vencer`
                                  : "Vencimiento próximo"
                                : "Sin fecha de vencimiento próxima"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-medium text-slate-900">Sin notificaciones</p>
                    <p className="mt-1 text-xs text-slate-500">No hay alertas pendientes por ahora.</p>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 p-2">
                <Link
                  href="/reportes"
                  onClick={() => setBellMenuOpen(false)}
                  className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-ev-navy hover:bg-slate-100"
                >
                  Ver reportes
                </Link>
              </div>
            </div>
          )}
        </div>
        {/* User menu */}
        <div className="relative" ref={accountMenuRef}>
          <button
            type="button"
            onClick={() => setAccountMenuOpen((value) => !value)}
            className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
          >
            <User className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Mi cuenta</span>
          </button>

          {accountMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
