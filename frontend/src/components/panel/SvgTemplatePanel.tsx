import { useState } from "react";
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

export default function SvgTemplatePanel({ onInsert }: SvgTemplatePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, Record<string, string | number>>>({});
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const getConfig = (tpl: SvgTemplate): Record<string, string | number> => {
    if (configs[tpl.id]) return configs[tpl.id];
    const defaults: Record<string, string | number> = {};
    tpl.fields.forEach((f) => {
      defaults[f.key] = f.default;
    });
    return defaults;
  };

  const updateConfig = (tplId: string, key: string, value: string | number) => {
    setConfigs((prev) => ({
      ...prev,
      [tplId]: { ...getConfigById(tplId), [key]: value },
    }));
  };

  const getConfigById = (tplId: string): Record<string, string | number> => {
    const tpl = svgTemplates.find((t) => t.id === tplId);
    if (!tpl) return {};
    return getConfig(tpl);
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
    <div className="border-t border-border">
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
                <div className="space-y-1">
                  {templates.map((tpl) => (
                    <div key={tpl.id}>
                      <button
                        onClick={() =>
                          setActiveTemplate(activeTemplate === tpl.id ? null : tpl.id)
                        }
                        className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                          activeTemplate === tpl.id
                            ? "bg-accent/20 text-accent"
                            : "text-fg-secondary hover:bg-surface-tertiary"
                        }`}
                      >
                        {tpl.name}
                        <span className="text-fg-muted ml-1">— {tpl.description}</span>
                      </button>

                      {activeTemplate === tpl.id && (
                        <div className="mt-1 ml-2 space-y-2 border-l-2 border-accent/30 pl-2">
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
                                    className="w-full bg-surface-primary border border-border rounded px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent resize-none"
                                  />
                                ) : field.type === "color" ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="color"
                                      value={String(value)}
                                      onChange={(e) =>
                                        updateConfig(tpl.id, field.key, e.target.value)
                                      }
                                      className="w-6 h-6 rounded border border-border cursor-pointer"
                                    />
                                    <input
                                      type="text"
                                      value={String(value)}
                                      onChange={(e) =>
                                        updateConfig(tpl.id, field.key, e.target.value)
                                      }
                                      className="flex-1 bg-surface-primary border border-border rounded px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent"
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
                                    className="w-full bg-surface-primary border border-border rounded px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={String(value)}
                                    onChange={(e) =>
                                      updateConfig(tpl.id, field.key, e.target.value)
                                    }
                                    className="w-full bg-surface-primary border border-border rounded px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent"
                                  />
                                )}
                              </div>
                            );
                          })}

                          <div className="flex gap-1 pt-1">
                            <button
                              onClick={() => handlePreview(tpl)}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-surface-tertiary hover:bg-border text-fg-secondary rounded text-[11px] transition-colors"
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
                            <div className="mt-2 border border-border rounded overflow-hidden bg-white">
                              <div className="text-[10px] text-fg-muted px-2 py-1 bg-surface-tertiary">
                                预览
                              </div>
                              <div
                                className="p-2"
                                dangerouslySetInnerHTML={{ __html: previewHtml }}
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
