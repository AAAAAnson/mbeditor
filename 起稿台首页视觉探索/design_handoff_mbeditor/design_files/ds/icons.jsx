// MBEditor · Direction A — Brand mark + inline SVG icon set.
// Hard rule: NO emoji anywhere. Every glyph is an inline SVG.
// All exported to window for cross-file <script type=text/babel> use.

// ── Logo: pixel-locked geometry. orange rounded square + cream stroke-M. ──
function BrandMark({ size = 32, radius = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="MBEditor" style={{ display: "block" }}>
      <rect width="100" height="100" rx={radius} fill="#E8553A"></rect>
      <path d="M24 74 L24 28 L50 54 L76 28 L76 74" fill="none" stroke="#FBF4E8" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"></path>
    </svg>
  );
}
// cream M on transparent — for use on orange surfaces
function BrandMarkCream({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: "block" }}>
      <path d="M24 74 L24 28 L50 54 L76 28 L76 74" fill="none" stroke="#FBF4E8" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"></path>
    </svg>
  );
}

function Icon({ size = 20, sw = 1.8, fill = "none", stroke = "currentColor", children, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", ...style }}>
      {children}
    </svg>
  );
}

const IconSparkle  = (p) => <Icon {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path><path d="M18.5 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"></path></Icon>;
const IconTemplate = (p) => <Icon {...p}><rect x="4" y="4" width="16" height="6" rx="1.5"></rect><rect x="4" y="13" width="7" height="7" rx="1.5"></rect><rect x="14" y="13" width="6" height="7" rx="1.5"></rect></Icon>;
const IconBlank    = (p) => <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path></Icon>;
const IconPen      = (p) => <Icon {...p}><path d="M16.5 4.5l3 3L8 19l-4 1 1-4z"></path><path d="M14 7l3 3"></path></Icon>;
const IconGear     = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"></circle><path d="M12 2.5l1.3 2.4 2.7-.5.5 2.7 2.4 1.3-1.4 2.3 1.4 2.3-2.4 1.3-.5 2.7-2.7-.5L12 21.5l-1.3-2.4-2.7.5-.5-2.7-2.4-1.3 1.4-2.3-1.4-2.3 2.4-1.3.5-2.7 2.7.5z"></path></Icon>;
const IconHome     = (p) => <Icon {...p}><path d="M4 11l8-7 8 7"></path><path d="M6 9.5V20h12V9.5"></path></Icon>;
const IconArrow    = (p) => <Icon {...p}><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></Icon>;
const IconArrowL   = (p) => <Icon {...p}><path d="M19 12H5"></path><path d="M11 6l-6 6 6 6"></path></Icon>;
const IconChevDown = (p) => <Icon {...p}><path d="M5 9l7 7 7-7"></path></Icon>;
const IconClock    = (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3.5 2"></path></Icon>;
const IconMic      = (p) => <Icon {...p}><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0"></path><path d="M12 17.5V21"></path></Icon>;
const IconCheck    = (p) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7"></path></Icon>;
const IconClose    = (p) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18"></path></Icon>;
const IconLock     = (p) => <Icon {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="2.2"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path></Icon>;
const IconCopy     = (p) => <Icon {...p}><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"></rect><path d="M5.5 15.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5"></path></Icon>;
const IconSend     = (p) => <Icon {...p}><path d="M21 4L3 11l7 3 3 7z"></path><path d="M10 14l4-4"></path></Icon>;
const IconRefresh  = (p) => <Icon {...p}><path d="M20 11a8 8 0 1 0-1 4"></path><path d="M20 4v6h-6"></path></Icon>;
const IconWarn     = (p) => <Icon {...p}><path d="M12 3l9.5 16.5H2.5z"></path><path d="M12 9.5v4.5M12 17.2v.1"></path></Icon>;
const IconInfo     = (p) => <Icon {...p}><circle cx="12" cy="12" r="9"></circle><path d="M12 10.5v6M12 7.4v.1"></path></Icon>;
const IconEye      = (p) => <Icon {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="3"></circle></Icon>;
const IconBook     = (p) => <Icon {...p}><path d="M4 5.5A2 2 0 0 1 6 4h6v15H6a2 2 0 0 0-2 1.5z"></path><path d="M20 5.5A2 2 0 0 0 18 4h-6v15h6a2 2 0 0 1 2 1.5z"></path></Icon>;
const IconStore    = (p) => <Icon {...p}><path d="M4 9l1-4h14l1 4"></path><path d="M4 9v10h16V9"></path><path d="M4 9a2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0"></path></Icon>;
const IconPin      = (p) => <Icon {...p}><path d="M12 21s7-6.3 7-11a7 7 0 0 0-14 0c0 4.7 7 11 7 11z"></path><circle cx="12" cy="10" r="2.5"></circle></Icon>;
const IconStroller = (p) => <Icon {...p}><path d="M4 5h2l2.5 8H18"></path><path d="M6.5 13a6.5 6.5 0 0 1 11.5-4.2L18 13"></path><circle cx="9" cy="18" r="1.6"></circle><circle cx="17" cy="18" r="1.6"></circle></Icon>;

Object.assign(window, {
  BrandMark, BrandMarkCream, Icon,
  IconSparkle, IconTemplate, IconBlank, IconPen, IconGear, IconHome, IconArrow, IconArrowL,
  IconChevDown, IconClock, IconMic, IconCheck, IconClose, IconLock, IconCopy, IconSend,
  IconRefresh, IconWarn, IconInfo, IconEye, IconBook, IconStore, IconPin, IconStroller,
});
