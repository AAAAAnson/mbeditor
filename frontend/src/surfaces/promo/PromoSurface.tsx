export default function PromoSurface() {
  return (
    <div className="h-full flex items-center justify-center" style={{ color: "var(--fg-4)" }}>
      <div className="text-center">
        <div className="title-serif" style={{ fontSize: 48, color: "var(--fg)", marginBottom: 8 }}>
          宣传片<span style={{ color: "var(--accent)" }}>.</span>
        </div>
        <div className="caps">宣传素材 · 展示页面</div>
        <p style={{ marginTop: 16, fontSize: 13, color: "var(--fg-3)", fontFamily: "var(--f-display)", fontStyle: "italic" }}>
          不属于正式产品功能。
        </p>
      </div>
    </div>
  );
}
