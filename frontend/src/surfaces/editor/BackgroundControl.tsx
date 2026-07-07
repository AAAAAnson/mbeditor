import {
  clearArticleBackground,
  getArticleBackground,
  setArticleBackground,
} from "../../utils/articleBackground";

type Props = {
  html: string;
  onChange: (nextHtml: string) => void;
};

/**
 * 文章背景色控件:显示当前信封壳背景(无则「透明」态),改色/清空都只改
 * draft.html 的最外层 <section> 背景——即会随复制到公众号的显式页背景。
 * 简单/专业模式都可用。
 */
export function BackgroundControl({ html, onChange }: Props) {
  const current = getArticleBackground(html);
  return (
    <div data-testid="bg-control" style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>背景</span>
      <label
        title="文章背景色(会随复制到公众号)"
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          cursor: "pointer",
          border: "1px solid var(--line)",
          background: current
            ? current
            : "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 10px 10px",
          display: "inline-block",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <input
          data-testid="bg-color-input"
          type="color"
          value={current ?? "#ffffff"}
          onInput={(e) => onChange(setArticleBackground(html, (e.target as HTMLInputElement).value))}
          style={{ opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
        />
      </label>
      {current ? (
        <button
          data-testid="bg-clear"
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onChange(clearArticleBackground(html))}
          title="清空文章背景(回到透明/公众号白)"
        >
          清空
        </button>
      ) : (
        <span data-testid="bg-empty" className="mono" style={{ fontSize: 10, color: "var(--fg-4)" }}>
          透明
        </span>
      )}
    </div>
  );
}
