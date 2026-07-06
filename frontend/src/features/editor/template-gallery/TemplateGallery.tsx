import { useCallback, useEffect, useMemo, useState } from "react";
import { IconClose } from "@/components/icons";
import {
  TEMPLATES,
  type Template,
  type TemplateColorParam,
  type TemplateTextParam,
} from "./templates";

interface TemplateGalleryProps {
  open: boolean;
  /** 当前文章正文长度，用来决定是否需要覆盖确认 */
  currentHtmlLength: number;
  onClose: () => void;
  onInsert: (template: Template) => void;
}

/** 超过这个长度就认为是"非空白草稿"，插入前需要用户确认 */
const NON_TRIVIAL_HTML_LENGTH = 200;

/**
 * 把内联 SVG 字符串编码成 data URL，喂给 <img src>。本地实现（与
 * StructurePanel.svgToDataUrl 同法），刻意不跨文件 import——契约 F：模板面板
 * 不耦合进 StructurePanel/共享组件。
 */
function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 校验 hex 颜色（#RGB / #RRGGBB / #RRGGBBAA） */
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * 按用户调好的配色 / 文案，对模板原始 html 做纯字符串替换，得到 patchedHtml。
 *
 * - 配色：每个 colorParam 把 html 中所有 `match`（原始 hex）整体替换成新值。
 *   只有当新值是合法 hex 且与 match 不同才替换，避免无意义改动。
 * - 文案：每个 textParam 把 html 中的 `match` 占位整体替换成用户输入。
 *
 * 该函数在 onInsert 之前于 TemplateGallery 内部完成全部参数化——StructurePanel
 * 的插入入口对此无感，拿到的就是已 patch 好的 template。
 */
function applyTemplateParams(
  template: Template,
  colorValues: Record<string, string>,
  textValues: Record<string, string>,
): Template {
  let html = template.html;

  for (const param of template.colorParams ?? []) {
    const next = colorValues[param.name];
    if (!next || next === param.match || !HEX_RE.test(next)) continue;
    html = html.split(param.match).join(next);
  }

  for (const param of template.textParams ?? []) {
    const raw = textValues[param.name];
    if (raw == null) continue;
    const next = raw.slice(0, param.maxLength);
    if (next === param.match || next.length === 0) continue;
    html = html.split(param.match).join(next);
  }

  return html === template.html ? template : { ...template, html };
}

/**
 * 插入模板画廊模态框。
 *
 * 行为约定（与 Agent E 的约束对齐）：
 *  - 点击"插入"后，若当前文章 html 长度 > 200，先弹 confirm；否则直接覆盖。
 *  - 模板 html 是 build time 打包的，所以点击插入是纯本地动作，不走网络。
 *  - 插入成功后立刻关闭画廊；toast 由父组件（StructurePanel）负责。
 *  - 本组件不调用 validator —— 模板文件已预校验过。
 */
export default function TemplateGallery({
  open,
  currentHtmlLength,
  onClose,
  onInsert,
}: TemplateGalleryProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  /** 当前展开「调配色/文案」面板的模板 id（一次最多展开一个） */
  const [tuningId, setTuningId] = useState<string | null>(null);
  /** 各模板的配色覆盖值：templateId -> (paramName -> hex) */
  const [colorValues, setColorValues] = useState<Record<string, Record<string, string>>>({});
  /** 各模板的文案覆盖值：templateId -> (paramName -> text) */
  const [textValues, setTextValues] = useState<Record<string, Record<string, string>>>({});

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const templates = useMemo(() => TEMPLATES, []);

  const setColor = useCallback((templateId: string, name: string, value: string) => {
    setColorValues((prev) => ({
      ...prev,
      [templateId]: { ...prev[templateId], [name]: value },
    }));
  }, []);

  const setText = useCallback((templateId: string, name: string, value: string) => {
    setTextValues((prev) => ({
      ...prev,
      [templateId]: { ...prev[templateId], [name]: value },
    }));
  }, []);

  const handleInsert = useCallback(
    (template: Template) => {
      if (currentHtmlLength > NON_TRIVIAL_HTML_LENGTH) {
        const ok = window.confirm(
          `当前文章已经有内容（约 ${currentHtmlLength.toLocaleString()} 字符），插入「${template.title}」会完全覆盖现有内容。确认继续？`,
        );
        if (!ok) return;
      }
      // 参数化在插入前于本组件内部完成；StructurePanel 拿到的就是 patch 好的 html。
      const patched = applyTemplateParams(
        template,
        colorValues[template.id] ?? {},
        textValues[template.id] ?? {},
      );
      onInsert(patched);
    },
    [currentHtmlLength, onInsert, colorValues, textValues],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="插入模板"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(10, 8, 9, 0.62)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        animation: "fade-in 0.18s ease-out",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(960px, 100%)",
          maxHeight: "calc(100vh - 48px)",
          background: "var(--bg-deep)",
          border: "1px solid var(--border-2)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-3)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "slide-up 0.22s ease-out",
        }}
      >
        <header
          style={{
            padding: "18px 22px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div className="caps" style={{ color: "var(--gold)", marginBottom: 6 }}>
              模板库 · WeChat SVG
            </div>
            <h2
              className="title-serif"
              style={{ margin: 0, fontSize: 26, color: "var(--fg)", lineHeight: 1.15 }}
            >
              插入一个可直接发布的模板
            </h2>
            <p
              style={{
                margin: "8px 0 0",
                color: "var(--fg-3)",
                fontSize: 12,
                lineHeight: 1.7,
                maxWidth: 620,
              }}
            >
              五大交互模式的生产级参考作品，点"插入"后会覆盖当前文章的正文，保留标题。插入后可以继续在编辑器里改文案、换配色。
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="btn btn-ghost btn-sm"
            style={{ flexShrink: 0 }}
          >
            <IconClose size={14} />
            关闭
          </button>
        </header>

        <div
          style={{
            padding: 20,
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
            alignContent: "start",
          }}
        >
          {templates.map((tpl) => {
            const focused = focusedId === tpl.id;
            const tuning = tuningId === tpl.id;
            const tplColors = colorValues[tpl.id] ?? {};
            const tplTexts = textValues[tpl.id] ?? {};
            const hasParams =
              (tpl.colorParams?.length ?? 0) > 0 || (tpl.textParams?.length ?? 0) > 0;
            // 缩略图主色：第一个配色参数的当前值，用于缺省占位色块。
            const fallbackColor =
              tplColors[tpl.colorParams?.[0]?.name ?? ""] ??
              tpl.colorParams?.[0]?.default ??
              "var(--border-3)";
            return (
              <article
                key={tpl.id}
                onMouseEnter={() => setFocusedId(tpl.id)}
                onMouseLeave={() => setFocusedId((current) => (current === tpl.id ? null : current))}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  padding: 16,
                  background: "var(--surface)",
                  border: `1px solid ${focused ? "var(--border-3)" : "var(--border-2)"}`,
                  borderRadius: "var(--r-md)",
                  boxShadow: focused ? "var(--shadow-2)" : "var(--shadow-1)",
                  transition: "all 0.18s var(--ease-out-expo)",
                  minHeight: 240,
                }}
              >
                {tpl.thumbnailSvg ? (
                  <img
                    src={svgToDataUrl(tpl.thumbnailSvg)}
                    alt={`${tpl.title} 缩略图`}
                    style={{
                      width: "100%",
                      height: 120,
                      objectFit: "cover",
                      borderRadius: "var(--r-sm)",
                      marginBottom: 12,
                      background: "var(--bg-deep)",
                      border: "1px solid var(--border)",
                    }}
                  />
                ) : (
                  <div
                    aria-label={`${tpl.title} 缩略图占位`}
                    style={{
                      width: "100%",
                      height: 120,
                      borderRadius: "var(--r-sm)",
                      marginBottom: 12,
                      background: fallbackColor,
                      border: "1px solid var(--border)",
                    }}
                  />
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span className="chip chip-accent" title="交互模式">
                    {tpl.pattern}
                  </span>
                  <span className="chip" title="全文字数">
                    {tpl.wordCount.toLocaleString()} 字
                  </span>
                </div>

                <h3
                  style={{
                    margin: "0 0 6px",
                    fontFamily: "var(--f-display)",
                    fontSize: 18,
                    lineHeight: 1.25,
                    color: "var(--fg)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {tpl.title}
                </h3>

                <div
                  className="caps"
                  style={{ color: "var(--fg-4)", marginBottom: 10, fontSize: 9 }}
                  title="选题样本"
                >
                  选题 · {tpl.topic}
                </div>

                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    lineHeight: 1.65,
                    color: "var(--fg-3)",
                    whiteSpace: "pre-line",
                    display: "-webkit-box",
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {tpl.preview}
                </p>

                {tuning && hasParams ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: "var(--r-sm)",
                      background: "var(--bg-deep)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {(tpl.colorParams ?? []).map((param: TemplateColorParam) => {
                      const value = tplColors[param.name] ?? param.default;
                      return (
                        <label
                          key={param.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 11,
                            color: "var(--fg-3)",
                          }}
                        >
                          <span style={{ minWidth: 52 }}>{param.label}</span>
                          <input
                            type="color"
                            aria-label={`${tpl.title} ${param.label} 取色`}
                            value={value}
                            onChange={(e) => setColor(tpl.id, param.name, e.target.value)}
                            style={{
                              width: 28,
                              height: 24,
                              padding: 0,
                              border: "1px solid var(--border-2)",
                              borderRadius: 4,
                              background: "transparent",
                              cursor: "pointer",
                            }}
                          />
                          <input
                            type="text"
                            aria-label={`${tpl.title} ${param.label} 色值`}
                            value={value}
                            spellCheck={false}
                            onChange={(e) => setColor(tpl.id, param.name, e.target.value)}
                            className="mono"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 11,
                              padding: "4px 6px",
                              border: "1px solid var(--border-2)",
                              borderRadius: 4,
                              background: "var(--surface)",
                              color: "var(--fg)",
                            }}
                          />
                        </label>
                      );
                    })}

                    {(tpl.textParams ?? []).map((param: TemplateTextParam) => {
                      const value = tplTexts[param.name] ?? param.default;
                      return (
                        <label
                          key={param.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 11,
                            color: "var(--fg-3)",
                          }}
                        >
                          <span style={{ minWidth: 52 }}>{param.label}</span>
                          <input
                            type="text"
                            aria-label={`${tpl.title} ${param.label} 文案`}
                            value={value}
                            maxLength={param.maxLength}
                            onChange={(e) => setText(tpl.id, param.name, e.target.value)}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 11,
                              padding: "4px 6px",
                              border: "1px solid var(--border-2)",
                              borderRadius: 4,
                              background: "var(--surface)",
                              color: "var(--fg)",
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : null}

                <div style={{ flex: 1 }} />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 14,
                    gap: 10,
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--fg-5)",
                      letterSpacing: "0.08em",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      flex: 1,
                      minWidth: 0,
                    }}
                    title={tpl.filename}
                  >
                    {tpl.filename}
                  </span>
                  {hasParams ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-expanded={tuning}
                      onClick={() =>
                        setTuningId((current) => (current === tpl.id ? null : tpl.id))
                      }
                      style={{ flexShrink: 0 }}
                    >
                      {tuning ? "收起" : "调配色/文案"}
                    </button>
                  ) : null}
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleInsert(tpl)}
                    style={{ flexShrink: 0 }}
                  >
                    插入
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <footer
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--border)",
            fontFamily: "var(--f-mono)",
            fontSize: 10,
            color: "var(--fg-5)",
            display: "flex",
            justifyContent: "space-between",
            letterSpacing: "0.08em",
          }}
        >
          <span>{templates.length} 个模板 · 已预校验</span>
          <span>插入 = 覆盖正文；标题保留</span>
        </footer>
      </div>
    </div>
  );
}
