import type { ReactNode } from "react";
import { useId, useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  maxWidth?: number | string;
  closeOnOverlay?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  maxWidth = 440,
  closeOnOverlay = true,
}: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, onClose);

  if (!open) return null;

  return (
    <div
      className="mb-overlay"
      onClick={() => {
        if (closeOnOverlay) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="mb-dialog"
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-dialog-body">
          {(icon || title) && (
            <div className="mb-dialog-head">
              {icon}
              {title && (
                <div id={titleId} className="mb-dialog-title">
                  {title}
                </div>
              )}
            </div>
          )}
          {children}
        </div>
        {footer && <div className="mb-dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

export default Dialog;
