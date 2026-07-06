import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  lead?: ReactNode;
  trailing?: ReactNode;
  error?: boolean;
  wrapClassName?: string;
}

export function Input({
  lead,
  trailing,
  error = false,
  wrapClassName = "",
  className = "",
  ...props
}: InputProps) {
  return (
    <div className={`mb-inputwrap ${error ? "err" : ""} ${wrapClassName}`.trim()}>
      {lead && <span className="lead">{lead}</span>}
      <input className={`mb-input ${className}`.trim()} {...props} />
      {trailing && <span className="trail">{trailing}</span>}
    </div>
  );
}

export default Input;
