import type { HTMLAttributes, ReactNode } from "react";

export type TagTone = "neutral" | "orange" | "success" | "warning" | "info" | "danger";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
  leading?: ReactNode;
  children: ReactNode;
}

export function Tag({ tone = "neutral", leading, children, className = "", ...props }: TagProps) {
  return (
    <span className={`mb-tag tone-${tone} ${className}`.trim()} {...props}>
      {leading}
      {children}
    </span>
  );
}

export default Tag;
