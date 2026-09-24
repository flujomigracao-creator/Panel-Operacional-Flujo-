import React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-sm font-semibold tracking-[0.01em] transition-[transform,background,color,border,box-shadow] duration-150 ease-out disabled:opacity-60 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary: "bg-brand-primary text-white border border-brand-primary-dark hover:bg-brand-primary-dark",
        secondary: "bg-bg-surface text-text-primary border border-border hover:border-border-hover",
        ghost: "bg-transparent text-brand-primary border border-border hover:bg-bg-surface",
        danger: "bg-danger text-white border border-danger-border hover:brightness-90",
      },
      size: {
        sm: "px-2.5 py-1.5 text-xs min-h-9",
        md: "px-3 py-2 text-sm min-h-[42px]",
        lg: "px-4 py-2.5 text-base min-h-[46px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export const Button = ({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
  type = "button",
  className = "",
  style = {},
  ...props
}) => {
  return (
    <button
      type={type}
      style={style}
      disabled={disabled}
      onClick={onClick}
      className={cn(buttonVariants({ variant, size }), disabled && "cursor-not-allowed", className)}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
