interface BrandMarkProps {
  size?: number;
  radius?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * The real MBEditor logo: an orange rounded square with a soft-cream stroked
 * "M". Inline SVG so it inherits crisp rendering at any size and needs no asset
 * pipeline. Brand colors per the productization redesign (橙红 / 暖白).
 */
export default function BrandMark({ size = 22, radius = 22, ariaLabel, className = "" }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={className}
    >
      <rect width="100" height="100" rx={radius} fill="#E8553A" />
      <path
        d="M24 74 L24 28 L50 54 L76 28 L76 74"
        fill="none"
        stroke="#FBF4E8"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
