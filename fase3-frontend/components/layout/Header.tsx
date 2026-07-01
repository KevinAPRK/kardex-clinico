"use client";
// components/layout/Header.tsx
import { Bell, Menu, User } from "lucide-react";
import { useStockAlerts } from "@/lib/hooks";
import { useDashboardSidebar } from "@/components/layout/DashboardShell";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { data: alerts } = useStockAlerts();
  const alertCount = alerts?.length ?? 0;
  const { openMobileSidebar } = useDashboardSidebar();

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
        <button className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100">
          <Bell className="h-5 w-5" />
          {alertCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          )}
        </button>
        {/* User avatar */}
        <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5">
          <User className="h-4 w-4 text-slate-500" />
          <span className="text-sm text-slate-700 font-medium">Mi cuenta</span>
        </div>
      </div>
    </header>
  );
}
