import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function StepIndicator({ steps, currentStep }) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, idx) => {
        const stepNumber = idx + 1;
        const isDone = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        return (
          <li key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-150",
                  isDone && "bg-success text-white",
                  isCurrent && !isDone && "bg-brand-primary text-white",
                  !isDone && !isCurrent && "bg-bg-surface text-text-muted"
                )}
              >
                {isDone ? <Check size={13} /> : stepNumber}
              </span>
              <span className={cn("text-xs font-medium", isCurrent ? "text-text-primary" : "text-text-muted")}>
                {label}
              </span>
            </div>
            {stepNumber < steps.length && <span className="h-px w-6 bg-border" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
