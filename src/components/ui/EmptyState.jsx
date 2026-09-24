import React from "react";
import { cn } from "@/lib/utils";
import Button from "./Button";

export const EmptyState = ({
  icon,
  title = "Sin datos",
  description = "No se encontraron elementos para mostrar.",
  actionLabel,
  onAction,
  className = "",
  style = {},
}) => (
  <div
    className={cn("flex flex-col items-center justify-center gap-3 px-8 py-12 text-center text-text-muted", className)}
    style={style}
  >
    {icon && <div className="text-3xl leading-none opacity-70">{icon}</div>}
    <div className="text-[0.95rem] font-semibold text-text-secondary">{title}</div>
    {description && <div className="max-w-[360px] text-[0.8rem] leading-relaxed">{description}</div>}
    {actionLabel && onAction && (
      <Button variant="primary" size="sm" onClick={onAction} className="mt-2">
        {actionLabel}
      </Button>
    )}
  </div>
);

export default EmptyState;
