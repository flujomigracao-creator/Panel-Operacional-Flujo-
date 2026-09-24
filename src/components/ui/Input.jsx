import React from "react";
import { cn } from "@/lib/utils";

export const Input = ({
  error = false,
  disabled = false,
  style = {},
  className = "",
  ...rest
}) => {
  return (
    <input
      disabled={disabled}
      style={style}
      className={cn(
        "w-full min-h-[42px] rounded-sm border px-2.5 py-2 text-sm text-text-primary outline-none transition-[border,background,box-shadow] duration-150",
        disabled ? "bg-bg-surface text-text-disabled" : "bg-bg-elevated",
        error ? "border-danger" : "border-border",
        "focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-glow",
        className
      )}
      {...rest}
    />
  );
};

export default Input;
