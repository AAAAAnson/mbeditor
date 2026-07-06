import type { ReactNode } from "react";

export interface FieldProps {
  label?: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, optional, hint, error, children, className = "" }: FieldProps) {
  return (
    <div className={`mb-field ${className}`.trim()}>
      {label && (
        <label className="mb-field-label">
          {label}
          {optional && <span className="opt">选填</span>}
        </label>
      )}
      {children}
      {(hint || error) && <span className={`mb-field-hint ${error ? "err" : ""}`.trim()}>{error || hint}</span>}
    </div>
  );
}

export default Field;
