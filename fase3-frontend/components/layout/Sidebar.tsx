"use client";
// components/layout/Sidebar.tsx
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ArrowLeftRight, Archive,
  ClipboardList, Truck, BarChart2, LogOut, ActivitySquare, Building2, Tags, Ruler,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const nav = [
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/materiales",   label: "Materiales",   icon: Package },
  { href: "/categorias",   label: "Categorías",   icon: Tags },
  { href: "/unidades",     label: "Unidades",     icon: Ruler },
  { href: "/movimientos",  label: "Movimientos",  icon: ArrowLeftRight },
  { href: "/lotes",        label: "Lotes",        icon: Archive },
  { href: "/kardex",       label: "Kardex",       icon: ClipboardList },
  { href: "/ambientes",    label: "Ambientes",    icon: Building2 },
  { href: "/proveedores",  label: "Proveedores",  icon: Truck },
  { href: "/reportes",     label: "Reportes",     icon: BarChart2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const db = createClient();

  async function handleLogout() {
    await db.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-700">
        <ActivitySquare className="h-6 w-6 text-cyan-400" />
        <div>
          <p className="text-sm font-semibold tracking-wide text-white">Kardex Clínico</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Inventario</p>
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
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-cyan-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
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
  );
}
