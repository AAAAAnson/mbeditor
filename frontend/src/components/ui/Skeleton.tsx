import type { HTMLAttributes } from "react";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  w?: number | string;
  h?: number | string;
  r?: number | string;
}

export function Skeleton({ w = "100%", h = 14, r, style, className = "", ...props }: SkeletonProps) {
  return (
    <div
      className={`mb-skel ${className}`.trim()}
      style={{ width: w, height: h, borderRadius: r, ...style }}
      {...props}
    />
  );
}

export default Skeleton;
