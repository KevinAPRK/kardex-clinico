"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";

type DashboardSidebarContextValue = {
  mobileOpen: boolean;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
};

const DashboardSidebarContext = createContext<DashboardSidebarContextValue | null>(null);

export function useDashboardSidebar() {
  const context = useContext(DashboardSidebarContext);

  if (!context) {
    throw new Error("useDashboardSidebar must be used within DashboardShell");
  }

  return context;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const openMobileSidebar = () => setMobileOpen(true);
  const closeMobileSidebar = () => setMobileOpen(false);

  return (
    <DashboardSidebarContext.Provider
      value={{ mobileOpen, openMobileSidebar, closeMobileSidebar }}
    >
      <div className="min-h-screen bg-slate-50 lg:pl-60">
        <Sidebar />
        <main className="min-h-screen overflow-x-hidden">{children}</main>
      </div>
    </DashboardSidebarContext.Provider>
  );
}