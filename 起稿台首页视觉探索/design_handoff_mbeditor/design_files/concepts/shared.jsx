// Shared brand mark + inline icon set for the three 起稿台 concepts.
// NO emoji anywhere — inline SVG only (product hard rule).

// ── Logo: orange rounded square + cream stroke-M. Pixel-locked geometry. ──
// rect rx=22 fill #E8553A ; M path stroke #FBF4E8 sw=13 round caps/joins.
function BrandMark({ size = 32, radius = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="MBEditor" role="img" style={{ display: "block" }}>
      <rect width="100" height="100" rx={radius} fill="#E8553A"></rect>
      <path d="M24 74 L24 28 L50 54 L76 28 L76 74" fill="none" stroke="#FBF4E8" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"></path>
    </svg>
  );
}

// Cream-on-transparent M (for use on orange surfaces)
function BrandMarkCream({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: "block" }}>
      <path d="M24 74 L24 28 L50 54 L76 28 L76 74" fill="none" stroke="#FBF4E8" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"></path>
    </svg>
  );
}

// generic icon wrapper
function Icon({ d, size = 20, sw = 1.8, fill = "none", stroke = "currentColor", children, vb = 24 }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
      {d ? <path d={d}></path> : children}
    </svg>
  );
}

// — specific icons —
const IconSparkle = (p) => <Icon {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path><path d="M18.5 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"></path></Icon>;
const IconTemplate = (p) => <Icon {...p}><rect x="4" y="4" width="16" height="6" rx="1.5"></rect><rect x="4" y="13" width="7" height="7" rx="1.5"></rect><rect x="14" y="13" width="6" height="7" rx="1.5"></rect></Icon>;
const IconBlank = (p) => <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M9.5 13.5l4-4 1.2 1.2-4 4-1.5.3z"></path></Icon>;
const IconGear = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"></circle><path d="M12 2.5l1.3 2.4 2.7-.5.5 2.7 2.4 1.3-1.4 2.3 1.4 2.3-2.4 1.3-.5 2.7-2.7-.5L12 21.5l-1.3-2.4-2.7.5-.5-2.7-2.4-1.3 1.4-2.3-1.4-2.3 2.4-1.3.5-2.7 2.7.5z"></path></Icon>;
const IconHome = (p) => <Icon {...p}><path d="M4 11l8-7 8 7"></path><path d="M6 9.5V20h12V9.5"></path></Icon>;
const IconArrow = (p) => <Icon {...p}><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></Icon>;
const IconClock = (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3.5 2"></path></Icon>;
const IconMic = (p) => <Icon {...p}><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0"></path><path d="M12 17.5V21"></path></Icon>;
const IconDots = (p) => <Icon {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"></circle><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"></circle></Icon>;
const IconPen = (p) => <Icon {...p}><path d="M16.5 4.5l3 3L8 19l-4 1 1-4z"></path><path d="M14 7l3 3"></path></Icon>;

Object.assign(window, {
  BrandMark, BrandMarkCream, Icon,
  IconSparkle, IconTemplate, IconBlank, IconGear, IconHome, IconArrow, IconClock, IconMic, IconDots, IconPen,
});
