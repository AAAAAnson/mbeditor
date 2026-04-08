import { useState, useMemo, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  PlusCircle,
  MousePointerClick,
  Layers,
  RotateCcw,
  GalleryHorizontalEnd,
  Type,
  Hand,
} from "lucide-react";
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

/** Icon per template id */
const TEMPLATE_ICONS: Record<string, typeof MousePointerClick> = {
  accordion: MousePointerClick,
  "before-after": Layers,
  "flip-card": RotateCcw,
  carousel: GalleryHorizontalEnd,
  "fade-in-text": Type,
  "press-reveal": Hand,
};

/** Accent color per template */
const TEMPLATE_COLORS: Record<string, string> = {
  accordion: "#E8553A",
  "before-after": "#6B7FBF",
  "flip-card": "#C9923E",
  carousel: "#3A9E7E",
  "fade-in-text": "#8B5CF6",
  "press-reveal": "#EC4899",
};

function getDefaultConfig(tpl: SvgTemplate): Record<string, string | number> {
  const defaults: Record<string, string | number> = {};
  tpl.fields.forEach((f) => { defaults[f.key] = f.default; });
  return defaults;
}

/** Heights that work well for each template type */
const TEMPLATE_PREVIEW_HEIGHT: Record<string, number> = {
  accordion: 160,
  "before-after": 220,
  "flip-card": 260,
  carousel: 240,
  "fade-in-text": 140,
  "press-reveal": 120,
};

function buildPreviewDoc(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:14px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1.6;color:#333;overflow:hidden;}
img{max-width:100%;border-radius:4px;}
section{margin-top:0 !important;margin-bottom:0 !important;}
</style></head><body>${html}</body></html>`;
}

export default function SvgTemplatePanel({ onInsert }: SvgTemplatePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, Record<string, string | number>>>({});

  const getConfig = useCallback((tpl: SvgTemplate): Record<string, string | number> => {
    if (configs[tpl.id]) return configs[tpl.id];
    return getDefaultConfig(tpl);
  }, [configs]);

  const updateConfig = (tplId: string, key: string, value: string | number) => {
    const tpl = svgTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    setConfigs((prev) => ({
      ...prev,
      [tplId]: { ...getConfig(tpl), [key]: value },
    }));
  };

  const handleInsert = (tpl: SvgTemplate) => {
    const config = getConfig(tpl);
    onInsert(tpl.render(config));
  };

  /** Live preview HTML for the active template */
  const activePreviewHtml = useMemo(() => {
    if (!activeTemplate) return "";
    const tpl = svgTemplates.find((t) => t.id === activeTemplate);
    if (!tpl) return "";
    return tpl.render(getConfig(tpl));
  }, [activeTemplate, configs, getConfig]);

  return (
    <div className="border-t border-border-primary">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-fg-secondary hover:text-fg-primary transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-mono text-[10px] font-semibold tracking-[1.5px] uppercase">
          交互模板
        </span>
        <span className="ml-auto text-[10px] text-fg-muted">{svgTemplates.length}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-4">
          {CATEGORIES.map((cat) => {
            const templates = svgTemplates.filter((t) => t.category === cat);
            if (templates.length === 0) return null;
            return (
              <div key={cat}>
                <div className="text-[10px] uppercase tracking-wider text-fg-muted mb-1.5 px-0.5">
                  {CATEGORY_LABELS[cat]}
                </div>
                <div className="space-y-2">
                  {templates.map((tpl) => {
                    const isActive = activeTemplate === tpl.id;
                    const Icon = TEMPLATE_ICONS[tpl.id] || MousePointerClick;
                    const color = TEMPLATE_COLORS[tpl.id] || "#E8553A";

                    return (
                      <div key={tpl.id}>
                        {/* Compact card row */}
                        <div
                          className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg cursor-pointer transition-all group ${
                            isActive
                              ? "bg-surface-tertiary ring-1 ring-border-secondary"
                              : "hover:bg-surface-tertiary/60"
                          }`}
                          onClick={() => setActiveTemplate(isActive ? null : tpl.id)}
                        >
                          {/* Icon badge */}
                          <div
                            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                            style={{ backgroundColor: color + "1A" }}
                          >
                            <Icon size={14} style={{ color }} />
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium text-fg-primary leading-tight truncate">
                              {tpl.name}
                            </div>
                            <div className="text-[10px] text-fg-muted leading-tight truncate mt-0.5">
                              {tpl.description}
                            </div>
                          </div>

                          {/* Insert button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleInsert(tpl); }}
                            className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 bg-accent hover:bg-accent-hover text-white transition-all"
                            title="插入到文章"
                          >
                            <PlusCircle size={12} />
                          </button>

                          {/* Expand indicator */}
                          {isActive ? (
                            <ChevronUp size={12} className="text-fg-muted shrink-0" />
                          ) : (
                            <ChevronDown size={12} className="text-fg-muted shrink-0 opacity-0 group-hover:opacity-60" />
                          )}
                        </div>

                        {/* Expanded: config + live preview */}
                        {isActive && (
                          <div className="mt-2 rounded-lg bg-surface-tertiary/40 p-3 space-y-3">
                            {/* Live preview — full height, no scroll */}
                            <div className="rounded-lg overflow-hidden border border-border-secondary">
                              <div className="text-[10px] text-fg-muted px-2.5 py-1 bg-surface-tertiary border-b border-border-secondary font-mono">
                                效果预览
                              </div>
                              <iframe
                                srcDoc={buildPreviewDoc(activePreviewHtml)}
                                className="w-full border-0"
                                style={{
                                  background: "#fff",
                                  height: (TEMPLATE_PREVIEW_HEIGHT[tpl.id] || 180) + "px",
                                }}
                                title={`${tpl.name} 预览`}
                              />
                            </div>

                            {/* Config fields */}
                            <div className="space-y-2">
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
                                        onChange={(e) => updateConfig(tpl.id, field.key, e.target.value)}
                                        rows={2}
                                        className="w-full bg-bg-primary border border-border-primary rounded-md px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent resize-none"
                                      />
                                    ) : field.type === "color" ? (
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="color"
                                          value={String(value)}
                                          onChange={(e) => updateConfig(tpl.id, field.key, e.target.value)}
                                          className="w-6 h-6 rounded border border-border-primary cursor-pointer"
                                        />
                                        <input
                                          type="text"
                                          value={String(value)}
                                          onChange={(e) => updateConfig(tpl.id, field.key, e.target.value)}
                                          className="flex-1 bg-bg-primary border border-border-primary rounded-md px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent font-mono"
                                        />
                                      </div>
                                    ) : field.type === "number" ? (
                                      <input
                                        type="number"
                                        value={Number(value)}
                                        onChange={(e) => updateConfig(tpl.id, field.key, parseFloat(e.target.value) || 0)}
                                        className="w-full bg-bg-primary border border-border-primary rounded-md px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent"
                                      />
                                    ) : (
                                      <input
                                        type="text"
                                        value={String(value)}
                                        onChange={(e) => updateConfig(tpl.id, field.key, e.target.value)}
                                        className="w-full bg-bg-primary border border-border-primary rounded-md px-2 py-1 text-xs text-fg-primary outline-none focus:border-accent"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Insert button */}
                            <button
                              onClick={() => handleInsert(tpl)}
                              className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[12px] font-medium transition-colors"
                            >
                              <PlusCircle size={13} />
                              插入到文章
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
