import React from "react";
import { cn } from "@/lib/utils";

/**
 * Card component – can be clickable (adds hover/focus affordances).
 * Props:
 *   clickable: boolean – if true adds hover/focus styles and keyboard interaction
 *   onClick, onKeyDown – forwarded when clickable
 *   className – additional classes
 *   style – custom inline style (merged with token defaults)
 */
export const Card = ({
  clickable = false,
  onClick,
  onKeyDown,
  children,
  className = "",
  style = {},
  ...props
}) => {
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? onKeyDown : undefined}
      className={cn(
        "flex flex-col gap-3 rounded-md border border-border bg-bg-elevated shadow-md",
        clickable && "cursor-pointer transition-[border,box-shadow] duration-150 hover:border-border-hover hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-glow",
        className
      )}
      style={{ padding: "var(--card-padding, 14px 16px)", ...style }}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
