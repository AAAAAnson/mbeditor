import { useCallback, useEffect, useMemo, useState } from "react";
import { IconClose, IconArrowLeft } from "@/components/icons";
import { toast } from "@/stores/toastStore";
import { fetchEffects, renderEffect } from "./effectApi";
import {
  CATEGORY_LABEL,
  type Effect,
  type EffectCategory,
  type RenderEffectPayload,
} from "./types";

interface EffectGalleryProps {
  open: boolean;
  onClose: () => void;
  /** 区块级插入：父组件负责把 html 插到选中区块之后并写回 draft */
  onInsert: (html: string) => void;
}

interface SlotValues {
  textSlots: Record<string, string>;
  imageSlots: Record<string, string>;
  colorSlots: Record<string, string>;
  timingParams: Record<string, number>;
}

/** 从 effect schema 的 default 初始化所有槽值。 */
function initSlotValues(effect: Effect): SlotValues {
  const textSlots: Record<string, string> = {};
  effect.textSlots.forEach((s) => {
    textSlots[s.name] = s.default;
  });
  const imageSlots: Record<string, string> = {};
  effect.imageSlots.forEach((s) => {
    imageSlots[s.name] = s.default;
  });
  const colorSlots: Record<string, string> = {};
  effect.colorSlots.forEach((s) => {
    colorSlots[s.name] = s.default;
  });
  const timingParams: Record<string, number> = {};
  effect.timingParams.forEach((p) => {
    timingParams[p.name] = p.default;
  });
  return { textSlots, imageSlots, colorSlots, timingParams };
}

/**
 * 交互效果画廊模态框（与整篇模板 TemplateGallery 并列的第二条插入路径）。
 *
 * 行为约定：
 *  - open 变 true 时拉 GET /agent/effects 列表（带 loading/error 态）。
 *  - 点效果卡片 -> 进入同 modal 内的"槽位表单"视图，按 schema 渲染各类输入。
 *  - "生成并插入" -> POST render，status==="ok" 才 onInsert(html)；否则 toast 报错。
 *  - 不在前端做 SVG 校验 —— 后端 render 是唯一校验门。
 */
export function EffectGallery({ open, onClose, onInsert }: EffectGalleryProps) {
  const [effects, setEffects] = useState<Effect[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<EffectCategory | "all">("all");
  const [selectedEffect, setSelectedEffect] = useState<Effect | null>(null);
  const [slotValues, setSlotValues] = useState<SlotValues | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ESC 关闭（照抄 TemplateGallery）
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // open 变 true 时拉效果列表；关闭时重置表单视图
  useEffect(() => {
    if (!open) {
      setSelectedEffect(null);
      setSlotValues(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchEffects()
      .then((list) => {
        if (cancelled) return;
        setEffects(list);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "加载效果列表失败";
        setLoadError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const categories = useMemo(() => {
    const set = new Set<EffectCategory>();
    effects.forEach((e) => set.add(e.category));
    return Array.from(set);
  }, [effects]);

  const visibleEffects = useMemo(() => {
    if (categoryFilter === "all") return effects;
    return effects.filter((e) => e.category === categoryFilter);
  }, [effects, categoryFilter]);

  const openEffectForm = useCallback((effect: Effect) => {
    setSelectedEffect(effect);
    setSlotValues(initSlotValues(effect));
  }, []);

  const backToList = useCallback(() => {
    setSelectedEffect(null);
    setSlotValues(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedEffect || !slotValues) return;
    setSubmitting(true);
    try {
      const payload: RenderEffectPayload = {
        textSlots: slotValues.textSlots,
        imageSlots: slotValues.imageSlots,
        colorSlots: slotValues.colorSlots,
        timingParams: slotValues.timingParams,
      };
      const result = await renderEffect(selectedEffect.id, payload);
      if (result.status === "ok") {
        onInsert(result.html);
        toast.success(`已插入效果 ${selectedEffect.title}`);
        onClose();
      } else {
        const reportMsg = (result.report as { issues?: { message?: string }[] } | null)
          ?.issues?.[0]?.message;
        toast.error(result.message || reportMsg || "生成失败");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [selectedEffect, slotValues, onInsert, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="插入效果"
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
              效果库 · 交互配方
            </div>
            <h2
              className="title-serif"
              style={{ margin: 0, fontSize: 26, color: "var(--fg)", lineHeight: 1.15 }}
            >
              {selectedEffect ? selectedEffect.title : "选一个交互效果填槽生成"}
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
              {selectedEffect
                ? selectedEffect.description
                : "8 个交互效果配方，填好文案、图片、配色与时序后生成合法 SVG，插入到选中区块之后（不覆盖正文）。"}
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

        {selectedEffect && slotValues ? (
          <SlotForm
            effect={selectedEffect}
            values={slotValues}
            onChange={setSlotValues}
            onBack={backToList}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        ) : (
          <>
            {categories.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  padding: "12px 20px 0",
                }}
              >
                <button
                  type="button"
                  className={`chip ${categoryFilter === "all" ? "chip-accent" : ""}`}
                  onClick={() => setCategoryFilter("all")}
                  style={{ cursor: "pointer", border: "none" }}
                >
                  全部
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`chip ${categoryFilter === cat ? "chip-accent" : ""}`}
                    onClick={() => setCategoryFilter(cat)}
                    style={{ cursor: "pointer", border: "none" }}
                  >
                    {CATEGORY_LABEL[cat]}
                  </button>
                ))}
              </div>
            )}

            <div
              style={{
                padding: 20,
                overflowY: "auto",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 14,
                alignContent: "start",
                flex: 1,
              }}
            >
              {loading && (
                <div
                  className="mono"
                  style={{ color: "var(--fg-4)", fontSize: 12, padding: 8, gridColumn: "1 / -1" }}
                >
                  正在加载效果列表…
                </div>
              )}
              {!loading && loadError && (
                <div
                  style={{
                    color: "var(--fg-3)",
                    fontSize: 12,
                    padding: 8,
                    gridColumn: "1 / -1",
                  }}
                >
                  加载失败：{loadError}
                </div>
              )}
              {!loading &&
                !loadError &&
                visibleEffects.map((effect) => (
                  <EffectCard key={effect.id} effect={effect} onSelect={openEffectForm} />
                ))}
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
              <span>{effects.length} 个效果 · 后端填槽校验</span>
              <span>插入 = 选中区块之后，不覆盖正文</span>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

interface EffectCardProps {
  effect: Effect;
  onSelect: (effect: Effect) => void;
}

function EffectCard({ effect, onSelect }: EffectCardProps) {
  const [focused, setFocused] = useState(false);
  return (
    <article
      onMouseEnter={() => setFocused(true)}
      onMouseLeave={() => setFocused(false)}
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
        minHeight: 180,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <span className="chip chip-accent" title="分类">
          {CATEGORY_LABEL[effect.category]}
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
        {effect.title}
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.65,
          color: "var(--fg-3)",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {effect.description}
      </p>

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
          style={{ fontSize: 10, color: "var(--fg-5)", letterSpacing: "0.08em" }}
          title={effect.id}
        >
          {effect.id}
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onSelect(effect)}
          style={{ flexShrink: 0 }}
        >
          填槽
        </button>
      </div>
    </article>
  );
}

interface SlotFormProps {
  effect: Effect;
  values: SlotValues;
  onChange: (values: SlotValues) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

const FIELD_LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--fg-3)",
  marginBottom: 4,
  letterSpacing: "0.02em",
};

const FIELD_INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 10px",
  fontSize: 13,
  color: "var(--fg)",
  background: "var(--surface)",
  border: "1px solid var(--border-2)",
  borderRadius: "var(--r-sm)",
};

function SlotForm({ effect, values, onChange, onBack, onSubmit, submitting }: SlotFormProps) {
  const setText = (name: string, value: string) =>
    onChange({ ...values, textSlots: { ...values.textSlots, [name]: value } });
  const setImage = (name: string, value: string) =>
    onChange({ ...values, imageSlots: { ...values.imageSlots, [name]: value } });
  const setColor = (name: string, value: string) =>
    onChange({ ...values, colorSlots: { ...values.colorSlots, [name]: value } });
  const setTiming = (name: string, value: number) =>
    onChange({ ...values, timingParams: { ...values.timingParams, [name]: value } });

  return (
    <>
      <div
        style={{
          padding: 20,
          overflowY: "auto",
          flex: 1,
          display: "grid",
          gap: 16,
        }}
      >
        {effect.textSlots.length > 0 && (
          <section style={{ display: "grid", gap: 10 }}>
            <div className="caps" style={{ color: "var(--fg-4)" }}>
              文案
            </div>
            {effect.textSlots.map((slot) => (
              <label key={slot.name}>
                <span style={FIELD_LABEL_STYLE}>
                  {slot.label}
                  <span className="mono" style={{ color: "var(--fg-5)", marginLeft: 6 }}>
                    ≤{slot.maxLength}
                  </span>
                </span>
                <input
                  type="text"
                  value={values.textSlots[slot.name] ?? ""}
                  maxLength={slot.maxLength}
                  placeholder={slot.label}
                  onChange={(e) => setText(slot.name, e.target.value)}
                  style={FIELD_INPUT_STYLE}
                />
              </label>
            ))}
          </section>
        )}

        {effect.imageSlots.length > 0 && (
          <section style={{ display: "grid", gap: 10 }}>
            <div className="caps" style={{ color: "var(--fg-4)" }}>
              图片
            </div>
            {effect.imageSlots.map((slot) => (
              <label key={slot.name}>
                <span style={FIELD_LABEL_STYLE}>{slot.label}</span>
                <input
                  type="url"
                  value={values.imageSlots[slot.name] ?? ""}
                  placeholder="https:// 开头的图片地址（留空用底色占位）"
                  onChange={(e) => setImage(slot.name, e.target.value)}
                  style={FIELD_INPUT_STYLE}
                />
              </label>
            ))}
          </section>
        )}

        {effect.colorSlots.length > 0 && (
          <section style={{ display: "grid", gap: 10 }}>
            <div className="caps" style={{ color: "var(--fg-4)" }}>
              配色
            </div>
            {effect.colorSlots.map((slot) => {
              const raw = values.colorSlots[slot.name] ?? slot.default;
              const isHex = /^#[0-9A-Fa-f]{6}$/.test(raw);
              return (
                <label
                  key={slot.name}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <input
                    type="color"
                    value={isHex ? raw : "#000000"}
                    onChange={(e) => setColor(slot.name, e.target.value)}
                    style={{
                      width: 36,
                      height: 32,
                      padding: 0,
                      border: "1px solid var(--border-2)",
                      borderRadius: "var(--r-sm)",
                      background: "transparent",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    aria-label={`${slot.label} 取色`}
                  />
                  <span style={{ flex: 1 }}>
                    <span style={FIELD_LABEL_STYLE}>{slot.label}</span>
                    <input
                      type="text"
                      value={raw}
                      placeholder={slot.default}
                      onChange={(e) => setColor(slot.name, e.target.value)}
                      style={{ ...FIELD_INPUT_STYLE, fontFamily: "var(--f-mono)" }}
                    />
                  </span>
                </label>
              );
            })}
          </section>
        )}

        {effect.timingParams.length > 0 && (
          <section style={{ display: "grid", gap: 10 }}>
            <div className="caps" style={{ color: "var(--fg-4)" }}>
              时序
            </div>
            {effect.timingParams.map((param) => {
              const value = values.timingParams[param.name] ?? param.default;
              return (
                <label key={param.name}>
                  <span style={FIELD_LABEL_STYLE}>
                    {param.label}：
                    <span className="mono" style={{ color: "var(--fg-2)" }}>
                      {value}
                      {param.unit}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={value}
                    onChange={(e) => setTiming(param.name, Number(e.target.value))}
                    style={{ width: "100%" }}
                    aria-label={param.label}
                  />
                </label>
              );
            })}
          </section>
        )}
      </div>

      <footer
        style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} disabled={submitting}>
          <IconArrowLeft size={12} />
          返回列表
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? "生成中…" : "生成并插入"}
        </button>
      </footer>
    </>
  );
}

export default EffectGallery;
