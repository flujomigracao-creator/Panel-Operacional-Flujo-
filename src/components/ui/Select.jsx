import React from "react";
import { cn } from "@/lib/utils";

export const Select = ({
  options = [],
  groups,
  placeholder,
  error = false,
  disabled = false,
  style = {},
  className = "",
  ...rest
}) => {
  return (
    <select
      disabled={disabled}
      style={style}
      className={cn(
        "w-full min-h-[42px] rounded-sm border px-2.5 py-2 text-sm text-text-primary outline-none transition-[border,box-shadow] duration-150",
        disabled ? "bg-bg-surface text-text-disabled" : "bg-bg-elevated",
        error ? "border-danger" : "border-border",
        "focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-glow",
        className
      )}
      {...rest}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {groups
        ? groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          ))
        : options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
    </select>
  );
};

export default Select;
