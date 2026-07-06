import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`mb-card ${className}`.trim()} {...props} />;
}

export default Card;
