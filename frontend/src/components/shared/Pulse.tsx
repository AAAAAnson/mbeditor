interface PulseProps {
  size?: number;
  className?: string;
}

export default function Pulse({ size = 8, className = "" }: PulseProps) {
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--success)",
        display: "inline-block",
        boxShadow: "0 0 0 0 rgba(63,143,114,0.6)",
        animation: "pulse-ring 2s infinite",
      }}
    />
  );
}
