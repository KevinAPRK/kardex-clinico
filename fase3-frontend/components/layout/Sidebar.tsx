"use client";
// components/layout/Sidebar.tsx
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ArrowLeftRight,
  ClipboardList, Truck, BarChart2, LogOut, ActivitySquare, Building2, Tags, Ruler,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useDashboardSidebar } from "@/components/layout/DashboardShell";

const nav = [
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/materiales",   label: "Materiales",   icon: Package },
  { href: "/categorias",   label: "Categorías",   icon: Tags },
  { href: "/unidades",     label: "Unidades",     icon: Ruler },
  { href: "/movimientos",  label: "Movimientos",  icon: ArrowLeftRight },
  { href: "/kardex",       label: "Kardex",       icon: ClipboardList },
  { href: "/ambientes",    label: "Ambientes",    icon: Building2 },
  { href: "/proveedores",  label: "Proveedores",  icon: Truck },
  { href: "/reportes",     label: "Reportes",     icon: BarChart2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const db = createClient();
  const { mobileOpen, closeMobileSidebar } = useDashboardSidebar();

  async function handleLogout() {
    await db.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/50 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeMobileSidebar}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-ev-navy text-white transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-ev-dark">
        <ActivitySquare className="h-6 w-6 text-ev-gold" />
        <div>
          <p className="text-sm font-semibold tracking-wide text-white">Kardex Evolution</p>
          <p className="text-[10px] text-slate-300 uppercase tracking-widest">Inventario</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={closeMobileSidebar}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-ev-gold text-ev-navy"
                  : "text-slate-300 hover:bg-ev-dark hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-slate-700">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
      </aside>
    </>
  );
}
