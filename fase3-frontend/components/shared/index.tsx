// components/shared/index.tsx
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, Clock, Info, Loader2 } from "lucide-react";
import type { MovementType } from "@/types";
import { movementLabel, movementColor } from "@/lib/utils";

// ── Stat Card ────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  iconColor?: string;
  trend?: string;
  trendUp?: boolean;
  alert?: boolean;
}
export function StatCard({ label, value, icon: Icon, iconColor = "text-slate-500", trend, trendUp, alert }: StatCardProps) {
  return (
    <div className={cn(
      "rounded-xl border bg-white p-5 shadow-sm",
      alert ? "border-red-200 bg-red-50" : "border-slate-200"
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className={cn("mt-1 text-2xl font-bold", alert ? "text-red-700" : "text-slate-900")}>
            {value}
          </p>
          {trend && (
            <p className={cn("mt-1 text-xs", trendUp ? "text-emerald-600" : "text-red-600")}>
              {trend}
            </p>
          )}
        </div>
        <div className={cn("rounded-lg p-2.5", alert ? "bg-red-100" : "bg-slate-100")}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}

// ── Movement Badge ───────────────────────────────────────────
export function MovementBadge({ type }: { type: MovementType }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
      movementColor(type)
    )}>
      {movementLabel(type)}
    </span>
  );
}

// ── Expiry Badge ─────────────────────────────────────────────
type ExpiryStatus = "expired" | "critical" | "warning" | "ok";
const expiryConfig: Record<ExpiryStatus, { label: string; className: string; icon: React.ElementType }> = {
  expired: { label: "Vencido",   className: "bg-red-100 text-red-700 border-red-200",     icon: AlertTriangle },
  critical:{ label: "Crítico",   className: "bg-red-50 text-red-600 border-red-200",      icon: Clock },
  warning: { label: "Próximo",   className: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  ok:      { label: "Vigente",   className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle },
};
export function ExpiryBadge({ status }: { status: ExpiryStatus }) {
  const { label, className, icon: Icon } = expiryConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Alert Banner ─────────────────────────────────────────────
type AlertType = "error" | "warning" | "info" | "success";
const alertConfig: Record<AlertType, { className: string; icon: React.ElementType }> = {
  error:   { className: "bg-red-50 border-red-200 text-red-800",     icon: AlertTriangle },
  warning: { className: "bg-amber-50 border-amber-200 text-amber-800", icon: AlertTriangle },
  info:    { className: "bg-blue-50 border-blue-200 text-blue-800",   icon: Info },
  success: { className: "bg-emerald-50 border-emerald-200 text-emerald-800", icon: CheckCircle },
};
export function AlertBanner({ type, message }: { type: AlertType; message: string }) {
  const { className, icon: Icon } = alertConfig[type];
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-3 text-sm", className)}>
      <Icon className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

// ── Loading Spinner ──────────────────────────────────────────
export function LoadingSpinner({ text = "Cargando..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Loader2 className="h-8 w-8 animate-spin mb-3" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────
export function EmptyState({ title, description, action }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-slate-100 p-4 mb-4">
        <Info className="h-8 w-8 text-slate-400" />
      </div>
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Page Header ──────────────────────────────────────────────
export function PageHeader({ title, description, action }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
