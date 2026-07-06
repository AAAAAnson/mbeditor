// Custom SVG icon set. Do not substitute with external icon packages.

import type { ReactNode } from "react";

export interface IconProps {
  size?: number;
  className?: string;
}

interface BaseIconProps extends IconProps {
  children: ReactNode;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

function IconBase({
  size = 14,
  className,
  children,
  fill = "none",
  stroke = "currentColor",
  strokeWidth = 1.5,
}: BaseIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const WARM_ICON_CORE_NAMES = [
  "IconSparkle",
  "IconTemplate",
  "IconDoc",
  "IconEdit",
  "IconSettings",
  "IconHome",
  "IconArrowRight",
  "IconArrowLeft",
  "IconChevronDown",
  "IconChevronUp",
  "IconChevronLeft",
  "IconChevronRight",
  "IconClock",
  "IconMic",
  "IconCheck",
  "IconClose",
  "IconLock",
  "IconCopy",
  "IconSend",
  "IconRefresh",
  "IconWarn",
  "IconInfo",
  "IconEye",
  "IconEyeOff",
  "IconBook",
  "IconStore",
  "IconPin",
  "IconStroller",
  "IconExternal",
  "IconUpload",
  "IconImage",
  "IconPlus",
  "IconTrash",
  "IconMoreHorizontal",
  "IconMoreVertical",
  "IconCode",
] as const;

export type WarmIconCoreName = typeof WARM_ICON_CORE_NAMES[number];

export function IconList({ size = 16, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </IconBase>
  );
}

export function IconEdit({ size = 16, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </IconBase>
  );
}

export function IconAgent({ size = 16, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12l3 3 5-6" />
    </IconBase>
  );
}

export function IconPlus({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className} strokeWidth={1.75}>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  );
}

export function IconSearch({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </IconBase>
  );
}

export function IconTrash({ size = 13, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M4.5 7h15M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6.5 7l.8 12A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.5L17.5 7" />
      <path d="M10 11v5.5M14 11v5.5" />
    </IconBase>
  );
}

export function IconSend({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M21 4 3 11l7 3 3 7z" />
      <path d="M10 14l4-4" />
    </IconBase>
  );
}

export function IconCheck({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className} strokeWidth={2}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </IconBase>
  );
}

export function IconSparkle({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M18.5 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </IconBase>
  );
}

export function IconTerminal({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </IconBase>
  );
}

export function IconEye({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  );
}

export function IconImage({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="M20 15.5 15.5 11 6 19" />
    </IconBase>
  );
}

export function IconDoc({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </IconBase>
  );
}

export function IconSettings({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5l1.3 2.4 2.7-.5.5 2.7 2.4 1.3-1.4 2.3 1.4 2.3-2.4 1.3-.5 2.7-2.7-.5L12 21.5l-1.3-2.4-2.7.5-.5-2.7-2.4-1.3 1.4-2.3-1.4-2.3 2.4-1.3.5-2.7 2.7.5z" />
    </IconBase>
  );
}

export function IconClose({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className} strokeWidth={1.75}>
      <path d="M18 6 6 18M6 6l12 12" />
    </IconBase>
  );
}

export function IconArrowRight({ size = 12, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </IconBase>
  );
}

export function IconArrowLeft({ size = 12, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </IconBase>
  );
}

export function IconCopy({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.2" />
      <path d="M5.5 15.5H5A1.5 1.5 0 0 1 3.5 14V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5" />
    </IconBase>
  );
}

export function IconCpu({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
    </IconBase>
  );
}

export function IconLock({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </IconBase>
  );
}

export function IconLeaf({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M4 20c0-9 6-15 16-15 0 10-6 15-16 15z" />
      <path d="M4 20c4-6 8-9 12-10" />
    </IconBase>
  );
}

export function IconWrench({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M14.7 6.3a4 4 0 0 0-5.2 5.1L3 17.9 6.1 21l6.5-6.5a4 4 0 0 0 5.1-5.2l-2.6 2.6-2.4-2.4 2.6-2.6z" />
    </IconBase>
  );
}

export function IconKeyboard({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </IconBase>
  );
}

export function IconColumns({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </IconBase>
  );
}

export function IconCode({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M9 7 4 12l5 5M15 7l5 5-5 5" />
    </IconBase>
  );
}

export function IconChevronDown({ size = 12, className }: IconProps) {
  return (
    <IconBase size={size} className={className} strokeWidth={1.75}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function IconChevronUp({ size = 12, className }: IconProps) {
  return (
    <IconBase size={size} className={className} strokeWidth={1.75}>
      <path d="m6 15 6-6 6 6" />
    </IconBase>
  );
}

export function IconShield({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M12 3 5 6v5c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3z" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function IconTemplate({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <rect x="4" y="4" width="16" height="6" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="14" y="13" width="6" height="7" rx="1.5" />
    </IconBase>
  );
}

export function IconHome({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 9.5V20h12V9.5" />
    </IconBase>
  );
}

export function IconChevronLeft({ size = 12, className }: IconProps) {
  return (
    <IconBase size={size} className={className} strokeWidth={1.75}>
      <path d="m15 5-7 7 7 7" />
    </IconBase>
  );
}

export function IconChevronRight({ size = 12, className }: IconProps) {
  return (
    <IconBase size={size} className={className} strokeWidth={1.75}>
      <path d="m9 5 7 7-7 7" />
    </IconBase>
  );
}

export function IconClock({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </IconBase>
  );
}

export function IconMic({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </IconBase>
  );
}

export function IconRefresh({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M20 11a8 8 0 1 0-1 4" />
      <path d="M20 4v6h-6" />
    </IconBase>
  );
}

export function IconWarn({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M12 3 21.5 19.5H2.5z" />
      <path d="M12 9.5v4.5M12 17.2v.1" />
    </IconBase>
  );
}

export function IconInfo({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v6M12 7.4v.1" />
    </IconBase>
  );
}

export function IconEyeOff({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M4 4l16 16" />
      <path d="M9.6 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.6 16.6 0 0 1-3.3 4" />
      <path d="M6.3 8.2A16.4 16.4 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.6-.76" />
      <path d="M9.9 10a3 3 0 0 0 4.1 4.2" />
    </IconBase>
  );
}

export function IconBook({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M4 5.5A2 2 0 0 1 6 4h6v15H6a2 2 0 0 0-2 1.5z" />
      <path d="M20 5.5A2 2 0 0 0 18 4h-6v15h6a2 2 0 0 1 2 1.5z" />
    </IconBase>
  );
}

export function IconStore({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M4 9l1-4h14l1 4" />
      <path d="M4 9v10h16V9" />
      <path d="M4 9a2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0" />
    </IconBase>
  );
}

export function IconPin({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M12 21s7-6.3 7-11a7 7 0 0 0-14 0c0 4.7 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </IconBase>
  );
}

export function IconStroller({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M4 5h2l2.5 8H18" />
      <path d="M6.5 13a6.5 6.5 0 0 1 11.5-4.2L18 13" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </IconBase>
  );
}

export function IconExternal({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </IconBase>
  );
}

export function IconUpload({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M12 16V5M8 8.5l4-4 4 4" />
      <path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />
    </IconBase>
  );
}

export function IconMoreHorizontal({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className} fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </IconBase>
  );
}

export function IconMoreVertical({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className} fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </IconBase>
  );
}

export function IconLink({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M9 15l6-6" />
      <path d="M11 6l1.5-1.5a4 4 0 0 1 5.7 5.7L16 12" />
      <path d="M13 18l-1.5 1.5a4 4 0 0 1-5.7-5.7L8 12" />
    </IconBase>
  );
}

export function IconKey({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <circle cx="8" cy="15" r="4.2" />
      <path d="M11 12l8.5-8.5" />
      <path d="M16 7l2.5 2.5" />
      <path d="M18.5 4.5L21 7" />
    </IconBase>
  );
}

export function IconCloudOff({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M4 4l16 16" />
      <path d="M9.4 6.5A6 6 0 0 1 17.8 11a4 4 0 0 1 2.4 6.6" />
      <path d="M6.6 8.8A6 6 0 0 0 6.2 11 4 4 0 0 0 7.5 18.5H15" />
    </IconBase>
  );
}

export function IconScissors({ size = 14, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M8.3 7.8L20 19" />
      <path d="M8.3 16.2L20 5" />
    </IconBase>
  );
}
