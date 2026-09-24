import React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog(props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogTrigger(props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogPortal(props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export function DialogClose(props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export function DialogOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-[120] bg-surface-overlay backdrop-blur-[6px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  );
}

export function DialogContent({ className, children, showCloseButton = true, maxWidth, ...props }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        style={{ maxWidth }}
        className={cn(
          "fixed top-1/2 left-1/2 z-[120] grid w-full max-h-[92vh] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_1fr_auto] overflow-hidden rounded-lg border border-border bg-bg-base shadow-lg outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-150",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Cerrar modal"
            className="absolute top-3 right-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-glow"
          >
            <X size={18} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex items-center justify-between gap-3 border-b border-border px-4 py-3.5", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3.5", className)}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }) {
  return <div data-slot="dialog-body" className={cn("overflow-y-auto p-4", className)} {...props} />;
}

export function DialogTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("m-0 text-base font-semibold text-text-primary", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-text-secondary", className)}
      {...props}
    />
  );
}

export default Dialog;
