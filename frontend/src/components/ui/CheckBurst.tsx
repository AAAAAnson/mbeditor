export interface CheckBurstProps {
  size?: number;
  className?: string;
}

export function CheckBurst({ size = 56, className = "" }: CheckBurstProps) {
  const iconSize = size * 0.55;
  return (
    <span
      className={`mb-stamp ${className}`.trim()}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--success-soft)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--success)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path
          d="M5 12.5l4.5 4.5L19 7"
          style={{
            strokeDasharray: 32,
            animation: "mb-check var(--t-celebrate) var(--ease) forwards",
          }}
        />
      </svg>
    </span>
  );
}

export default CheckBurst;
