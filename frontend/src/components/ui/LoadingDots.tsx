import type { HTMLAttributes } from "react";

export function LoadingDots({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`mb-dots ${className}`.trim()} {...props}>
      <span />
      <span />
      <span />
    </span>
  );
}

export default LoadingDots;
