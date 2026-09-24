import React from "react";
import { cn } from "@/lib/utils";

const COLORS = [
  "#534AB7",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#06b6d4",
];

const stringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
};

export const Avatar = ({
  name = "",
  src,
  size = 40,
  className = "",
  style = {},
  ...props
}) => {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const bg = src ? "transparent" : stringToColor(name);

  return (
    <div
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white", className)}
      {...props}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.4,
        ...style,
      }}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials || "?"
      )}
    </div>
  );
};

export default Avatar;
