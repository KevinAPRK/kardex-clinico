// lib/utils/index.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { MovementType, MaterialUnit } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split("-");
    return `${day}/${month}/${year}`;
  }
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatQty(n: number, unit: MaterialUnit): string {
  const labels: Record<string, string> = {
    unit: "und", box: "cja", blister: "blis", vial: "vial", ampoule: "amp",
    ml: "mL", mg: "mg", g: "g", l: "L", tablet: "comp", capsule: "cáp",
  };
  return `${n.toLocaleString("es-PE")} ${labels[unit] ?? unit}`;
}

export function movementLabel(type: MovementType): string {
  const labels: Record<MovementType, string> = {
    entry: "Entrada", exit: "Salida", adjustment: "Ajuste",
    transfer: "Transferencia", return: "Devolución", loss: "Pérdida",
  };
  return labels[type] ?? type;
}

export function movementColor(type: MovementType): string {
  const colors: Record<MovementType, string> = {
    entry: "text-emerald-700 bg-emerald-50 border-emerald-200",
    exit: "text-blue-700 bg-blue-50 border-blue-200",
    adjustment: "text-amber-700 bg-amber-50 border-amber-200",
    transfer: "text-purple-700 bg-purple-50 border-purple-200",
    return: "text-teal-700 bg-teal-50 border-teal-200",
    loss: "text-red-700 bg-red-50 border-red-200",
  };
  return colors[type] ?? "text-gray-700 bg-gray-50 border-gray-200";
}

export function daysUntilExpiry(expiryDate: string): number {
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
}

export function expiryStatus(expiryDate: string): "expired" | "critical" | "warning" | "ok" {
  const days = daysUntilExpiry(expiryDate);
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  return "ok";
}

export function periodDates(period: "week" | "month" | "quarter"): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (period === "week") from.setDate(from.getDate() - 7);
  else if (period === "month") from.setMonth(from.getMonth() - 1);
  else from.setMonth(from.getMonth() - 3);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
