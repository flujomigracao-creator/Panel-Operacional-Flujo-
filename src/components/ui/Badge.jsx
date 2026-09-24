import React from "react";
import { cn } from "@/lib/utils";

const STATUS_MAP = {
  pendiente: { label: "Pendiente", cls: "text-status-pendiente bg-status-pendiente-bg border-status-pendiente-border", dot: true },
  procesando: { label: "Procesando", cls: "text-status-procesando bg-status-procesando-bg border-status-procesando-border", dot: true },
  esperando: { label: "Esperando docs", cls: "text-status-esperando bg-status-esperando-bg border-status-esperando-border", dot: true },
  esperando_docs: { label: "Esperando docs", cls: "text-status-esperando bg-status-esperando-bg border-status-esperando-border", dot: true },
  completada: { label: "Completado", cls: "text-status-completada bg-status-completada-bg border-status-completada-border", dot: true },
  cancelada: { label: "Cancelado", cls: "text-status-cancelada bg-status-cancelada-bg border-status-cancelada-border", dot: true },
  success: { label: "Success", cls: "text-success bg-success-bg border-success-border", dot: false },
  warning: { label: "Warning", cls: "text-warning bg-warning-bg border-warning-border", dot: false },
  danger: { label: "Danger", cls: "text-danger bg-danger-bg border-danger-border", dot: false },
  info: { label: "Info", cls: "text-info bg-info-bg border-info-border", dot: false },
};

export const Badge = ({
  status = "info",
  children,
  dot = true,
  className = "",
  ...props
}) => {
  const cfg = STATUS_MAP[status] || STATUS_MAP.info;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--badge-radius)] border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.05em] whitespace-nowrap",
        cfg.cls,
        className
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children || cfg.label}
    </span>
  );
};

export default Badge;
