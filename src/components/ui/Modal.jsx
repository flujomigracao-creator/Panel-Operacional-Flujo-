import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogClose,
} from "./dialog";

export const Modal = ({
  isOpen = true,
  title,
  children,
  footer,
  onClose,
  maxWidth = 640,
  ariaLabel,
}) => {
  const hasHeader = Boolean(title || onClose);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent maxWidth={maxWidth} showCloseButton={false}>
        {/* Radix requires an accessible title; keep it visually hidden unless we also render a visible heading below. */}
        <DialogTitle className="sr-only">{title || ariaLabel || "Diálogo"}</DialogTitle>

        {hasHeader && (
          <DialogHeader>
            {title && <h2 className="m-0 [font:var(--font-page-title)] text-text-primary">{title}</h2>}
            {onClose && (
              <DialogClose
                aria-label="Cerrar modal"
                onClick={onClose}
                className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-glow"
              >
                <span aria-hidden="true">&times;</span>
              </DialogClose>
            )}
          </DialogHeader>
        )}

        <DialogBody>{children}</DialogBody>

        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
};

export default Modal;
