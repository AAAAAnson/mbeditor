import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Eye, PlusCircle } from "lucide-react";
import { svgTemplates, type SvgTemplate } from "@/utils/svg-templates";

interface SvgTemplatePanelProps {
  onInsert: (html: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  click: "点击交互",
  animation: "动画效果",
  slide: "滑动切换",
};

const CATEGORIES: SvgTemplate["category"][] = ["click", "slide", "animation"];

function getDefaultConfig(tpl: SvgTemplate): Record<string, string | number> {
  const defaults: Record<string, string | number> = {};
  tpl.fields.forEach((f) => {
    defaults[f.key] = f.default;
  });
  return defaults;
}

/** Build a self-contained srcdoc for mini preview */
function buildPreviewDoc(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:8px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;line-height:1.5;color:#333;overflow:hidden;transform-origin:top left;}
img{max-width:100%;border-radius:4px;}
</style></head><body>${html}</body></html>`;
}

export default function SvgTemplatePanel({ onInsert }: SvgTemplatePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, Record<string, string | number>>>({});
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  /** Memoize default rendered HTML for each template */
  const defaultPreviews = useMemo(() => {
    const map: Record<string, string> = {};
    svgTemplates.forEach((tpl) => {
      const cfg = getDefaultConfig(tpl);
      map[tpl.id] = tpl.render(cfg);
    });
    return map;
  }, []);

  const getConfig = (tpl: SvgTemplate): Record<string, string | number> => {
    if (configs[tpl.id]) return configs[tpl.id];
    return getDefaultConfig(tpl);
  };

  const updateConfig = (tplId: string, key: string, value: string | number) => {
    const tpl = svgTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    setConfigs((prev) => ({
      ...prev,
      [tplId]: { ...getConfig(tpl), [key]: value },
    }));
  };

  const handlePreview = (tpl: SvgTemplate) => {
    const config = getConfig(tpl);
    const html = tpl.render(config);
    setPreviewHtml(html);
  };

  const handleInsert = (tpl: SvgTemplate) => {
    const config = getConfig(tpl);
    const html = tpl.render(config);
    onInsert(html);
  };

  return (
    <div className="border-t border-border-primary">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1 px-4 py-2 text-xs font-medium text-fg-secondary hover:text-fg-primary transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        SVG 交互模板
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {CATEGORIES.map((cat) => {
            const templates = svgTemplates.filter((t) => t.category === cat);
            if (templates.length === 0) return null;
            return (
              <div key={cat}>
                <div className="text-[10px] uppercase tracking-wider text-fg-muted mb-1">
                  {CATEGORY_LABELS[cat]}
                </div>
                <div className="space-y-2">
                  {templates.map((tpl) => (
                    <div key={tpl.id} className={`rounded-lg overflow-hidden border transition-colors ${activeTemplate === tpl.id ? "border-accent-border" : "border-border-secondary"}`}>
                      {/* Live mini preview */}
                      <button
                        onClick={() =>
                          setActiveTemplate(activeTemplate === tpl.id ? null : tpl.id)
                        }
                        className="w-full relative block cursor-pointer"
                      >
                        <iframe
                          srcDoc={buildPreviewDoc(defaultPreviews[tpl.id])}
                          className="w-full h-[80px] pointer-events-none border-0"
                          style={{ background: "#fff" }}
                          title={tpl.name}
                          tabIndex={-1}
                          loading="lazy"
                        />
                        {/* Overlay with name */}
                        <div className="absolute inset-0 flex items-end justify-start bg-gradient-to-t from-black/50 to-transparent p-2">
                          <span className="text-white text-[11px] font-semibold drop-shadow-sm">{tpl.name}</span>
                        </div>
                      </button>
                      {/* Info & insert */}
                      <div className="bg-surface-secondary px-2.5 py-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-fg-muted truncate">{tpl.description}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleInsert(tpl); }}
                          className="shrink-0 px-2 py-1 bg-accent hover:bg-accent-hover text-white rounded text-[11px] font-medium transition-colors"
                        >
                          插入
                        </button>
                      </div>

                      {activeTemplate === tpl.id && (
                        <div className="mt-1 ml-2 space-y-2 border-l-2 border-accent-border pl-2">
                          {tpl.fields.map((field) => {
                            const config = getConfig(tpl);
                            const value = config[field.key] ?? field.default;
                            return (
                              <div key={field.key}>
                                <label className="text-[10px] text-fg-muted block mb-0.5">
                                  {field.label}
                                </label>
                                {field.type === "textarea" ? (
                                  <textarea
                                    value={String(value)}
                                    onChange={(e) =>
                                      updateConfig(tpl.id, field.key, e.target.value)
                                    }
                                    rows={2}
                                    className="w-full bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent resize-none"
                                  />
                                ) : field.type === "color" ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="color"
                                      value={String(value)}
                                      onChange={(e) =>
                                        updateConfig(tpl.id, field.key, e.target.value)
                                      }
                                      className="w-6 h-6 rounded border border-border-primary cursor-pointer"
                                    />
                                    <input
                                      type="text"
                                      value={String(value)}
                                      onChange={(e) =>
                                        updateConfig(tpl.id, field.key, e.target.value)
                                      }
                                      className="flex-1 bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent"
                                    />
                                  </div>
                                ) : field.type === "number" ? (
                                  <input
                                    type="number"
                                    value={Number(value)}
                                    onChange={(e) =>
                                      updateConfig(
                                        tpl.id,
                                        field.key,
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="w-full bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={String(value)}
                                    onChange={(e) =>
                                      updateConfig(tpl.id, field.key, e.target.value)
                                    }
                                    className="w-full bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent"
                                  />
                                )}
                              </div>
                            );
                          })}

                          <div className="flex gap-1 pt-1">
                            <button
                              onClick={() => handlePreview(tpl)}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-surface-tertiary hover:bg-border-primary text-fg-secondary rounded text-[11px] transition-colors"
                            >
                              <Eye size={11} /> 预览
                            </button>
                            <button
                              onClick={() => handleInsert(tpl)}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-accent hover:bg-accent-hover text-white rounded text-[11px] transition-colors"
                            >
                              <PlusCircle size={11} /> 插入到文章
                            </button>
                          </div>

                          {previewHtml && activeTemplate === tpl.id && (
                            <div className="mt-2 border border-border-primary rounded overflow-hidden bg-white">
                              <div className="text-[10px] text-fg-muted px-2 py-1 bg-surface-tertiary">
                                预览
                              </div>
                              <iframe
                                srcDoc={buildPreviewDoc(previewHtml)}
                                className="w-full h-[160px] border-0"
                                style={{ background: "#fff" }}
                                title="preview"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
