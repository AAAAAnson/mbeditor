import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  roleType?: "tabs" | "buttons";
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
  roleType = "tabs",
}: SegmentedProps<T>) {
  const useTabRoles = roleType === "tabs";
  return (
    <div className={`mb-seg ${className}`.trim()} role={useTabRoles ? "tablist" : undefined} aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={useTabRoles ? "tab" : undefined}
            aria-selected={useTabRoles ? active : undefined}
            aria-pressed={useTabRoles ? undefined : active}
            className={`mb-seg-opt ${active ? "on" : ""}`.trim()}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
