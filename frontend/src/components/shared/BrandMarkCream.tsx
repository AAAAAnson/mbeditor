interface BrandMarkCreamProps {
  size?: number;
  className?: string;
}

export default function BrandMarkCream({ size = 32, className = "" }: BrandMarkCreamProps) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className={className}>
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
