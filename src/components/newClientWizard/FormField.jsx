import React from "react";
import Input from "../ui/Input";

export default function FormField({ label, name, value, onChange, error, required, children, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={`wizard-${name}`}
        className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary"
      >
        {label}{required ? " *" : ""}
      </label>
      {children || (
        <Input
          id={`wizard-${name}`}
          value={value}
          onChange={(event) => onChange(name, event.target.value)}
          error={Boolean(error)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `wizard-${name}-error` : undefined}
          {...props}
        />
      )}
      {error && (
        <span id={`wizard-${name}-error`} role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
