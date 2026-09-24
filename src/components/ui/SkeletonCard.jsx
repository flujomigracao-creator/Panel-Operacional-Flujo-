import React from "react";
import { cn } from "@/lib/utils";

export const SkeletonCard = ({ height = 16, width = "100%", radius = 6, className = "", style = {} }) => (
  <div
    className={cn("animate-pulse bg-bg-surface", className)}
    style={{
      height,
      width,
      borderRadius: radius,
      ...style,
    }}
  />
);

export const SkeletonTramiteCard = () => (
  <div
    className="flex items-center gap-3 rounded-[var(--card-radius,10px)]"
    style={{ padding: "var(--card-padding, 14px 16px)" }}
  >
    <SkeletonCard width={40} height={40} radius="50%" />
    <div className="flex flex-1 flex-col gap-2">
      <SkeletonCard height={14} width="60%" />
      <SkeletonCard height={12} width="40%" />
    </div>
  </div>
);

export default SkeletonCard;
