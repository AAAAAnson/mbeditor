// SvgEditPanel — the visual editor for a selected inline-SVG block (WP-P2-1).
//
// Pure presentational panel: it receives a parsed SvgModel + a patchAttr
// callback (from useSvgPatch) and renders three sections — colours, hotspots,
// and SMIL timeline. Every edit funnels through patchAttr, which re-serialises
// the svg and writes the whole html back via onFieldChange (contract B).
//
// It is mounted as an independent side panel inside CenterStage and never
// touches the P1-3 preview rendering (wechat/raw Seg, iframe) — contract E.
// Zero new dependencies: native <input type="color"> + number inputs.

import { useEffect, useState } from "react";
import { normalizeHex, type SvgModel } from "./svgParse";

// SMIL clock-value guard. We only accept the subset the timeline panel is meant
// to edit: a numeric offset with an optional s/ms unit (e.g. "0s", "0.6s",
// "250ms", "1"), or an event-based begin like "btn1.click" / "btn1.click+0.2s".
// Anything else (stray ";", "url(...)", inline handlers, arbitrary text) is
// rejected so a raw input value can never be spliced verbatim into draft.html.
const SMIL_CLOCK_RE = /^\s*[\d.]+(?:ms|s)?\s*$/;
const SMIL_EVENT_RE = /^\s*[A-Za-z_][\w-]*\.[A-Za-z]+(?:[+-][\d.]+(?:ms|s)?)?\s*$/;

function isValidSmilValue(attr: "begin" | "dur", value: string): boolean {
  // Allow clearing the field (empty string maps to attribute removal upstream).
  if (value.trim() === "") return true;
  if (SMIL_CLOCK_RE.test(value)) return true;
  // begin additionally supports event references; dur is clock-only.
  return attr === "begin" && SMIL_EVENT_RE.test(value);
}

export interface SvgEditPanelProps {
  model: SvgModel | null;
  patchAttr: (elementIndex: number, attr: string, value: string) => void;
}

const SECTION_TITLE: React.CSSProperties = {
  fontFamily: "var(--f-mono)",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--fg-4)",
  margin: "0 0 8px",
};

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const LABEL: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 11,
  color: "var(--fg-3)",
  fontFamily: "var(--f-mono)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const NUM_INPUT: React.CSSProperties = {
  width: 64,
  background: "var(--bg-deep)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--fg-2)",
  fontFamily: "var(--f-mono)",
  fontSize: 11,
  padding: "4px 6px",
};

const TEXT_INPUT: React.CSSProperties = {
  width: 88,
  background: "var(--bg-deep)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--fg-2)",
  fontFamily: "var(--f-mono)",
  fontSize: 11,
  padding: "4px 6px",
};

function ColorRow({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (hex: string) => void;
}) {
  // Local text state so a half-typed hex doesn't spam patchAttr.
  const [text, setText] = useState(value);

  // Keep the local draft in sync when the parsed model hands us a new hex
  // (e.g. the user edited the HTML source directly while the panel is open).
  // Without this, a stale Enter/blur would revert the just-typed source change.
  useEffect(() => {
    setText(value);
  }, [value]);

  const commitText = () => {
    const hex = normalizeHex(text);
    if (hex && hex !== value) {
      onCommit(hex);
    } else {
      setText(value);
    }
  };

  return (
    <div style={ROW}>
      <span style={LABEL} title={label}>
        {label}
      </span>
      <input
        type="color"
        aria-label={`${label} 颜色`}
        value={value}
        onChange={(event) => {
          const hex = normalizeHex(event.target.value);
          if (hex) {
            setText(hex);
            onCommit(hex);
          }
        }}
        style={{
          width: 28,
          height: 24,
          padding: 0,
          border: "1px solid var(--border)",
          borderRadius: 4,
          background: "transparent",
          cursor: "pointer",
        }}
      />
      <input
        type="text"
        aria-label={`${label} 色值`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commitText}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitText();
        }}
        style={TEXT_INPUT}
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onCommit,
  "aria-id": ariaId,
}: {
  label: string;
  value: number;
  onCommit: (next: string) => void;
  "aria-id": string;
}) {
  // Controlled + commit-on-blur/Enter: avoids a full parse→serialize round-trip
  // per keystroke, and refreshes when a different hotspot/model is selected.
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "" || !Number.isFinite(Number(trimmed))) {
      setText(String(value));
      return;
    }
    if (Number(trimmed) !== value) onCommit(trimmed);
  };

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--fg-4)" }}>
      {label}
      <input
        type="number"
        aria-label={`${ariaId} ${label}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        style={NUM_INPUT}
      />
    </label>
  );
}

function SmilInput({
  label,
  attr,
  value,
  onCommit,
  "aria-id": ariaId,
}: {
  label: string;
  attr: "begin" | "dur";
  value: string;
  onCommit: (next: string) => void;
  "aria-id": string;
}) {
  // Controlled so a model change (different block, or a direct source edit)
  // refreshes the field instead of showing the previous node's value.
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);

  const valid = isValidSmilValue(attr, text);

  const commit = () => {
    if (!valid) {
      // Reject malformed input: never forward an unvalidated string to
      // setAttribute. Snap back to the last known-good value from the model.
      setText(value);
      return;
    }
    if (text !== value) onCommit(text);
  };

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--fg-4)" }}>
      {label}
      <input
        type="text"
        aria-label={`${ariaId} ${label}`}
        aria-invalid={!valid}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        style={{
          ...TEXT_INPUT,
          borderColor: valid ? "var(--border)" : "var(--danger)",
        }}
      />
    </label>
  );
}

export default function SvgEditPanel({ model, patchAttr }: SvgEditPanelProps) {
  if (!model || !model.ok) {
    return (
      <div
        data-testid="svg-edit-panel"
        style={{ padding: 16, fontSize: 11, color: "var(--fg-5)", fontFamily: "var(--f-mono)" }}
      >
        未能解析所选 SVG。
      </div>
    );
  }

  const { colors, hotspots, smil } = model;
  const empty = colors.length === 0 && hotspots.length === 0 && smil.length === 0;

  return (
    <div
      data-testid="svg-edit-panel"
      style={{
        width: 280,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--surface)",
        overflow: "auto",
        padding: 16,
      }}
    >
      <div className="caps" style={{ marginBottom: 14 }}>
        SVG 可视化编辑
      </div>

      {empty && (
        <div style={{ fontSize: 11, color: "var(--fg-5)", fontFamily: "var(--f-mono)" }}>
          所选 SVG 没有可编辑的颜色、热区或动画。
        </div>
      )}

      {colors.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <h4 style={SECTION_TITLE}>颜色 ({colors.length})</h4>
          {colors.map((color) => (
            <ColorRow
              key={color.id}
              label={color.label}
              value={color.value}
              onCommit={(hex) => patchAttr(color.elementIndex, color.attr, hex)}
            />
          ))}
        </section>
      )}

      {hotspots.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <h4 style={SECTION_TITLE}>热区 ({hotspots.length})</h4>
          {hotspots.map((hotspot) => (
            <div key={hotspot.id} style={{ marginBottom: 12 }}>
              <div style={{ ...LABEL, marginBottom: 6, color: "var(--fg-2)" }} title={hotspot.elementId}>
                #{hotspot.elementId} ({hotspot.tag})
              </div>
              {hotspot.tag === "rect" ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <NumberInput
                    label="x"
                    aria-id={hotspot.elementId}
                    value={hotspot.x ?? 0}
                    onCommit={(next) => patchAttr(hotspot.elementIndex, "x", next)}
                  />
                  <NumberInput
                    label="y"
                    aria-id={hotspot.elementId}
                    value={hotspot.y ?? 0}
                    onCommit={(next) => patchAttr(hotspot.elementIndex, "y", next)}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 10, color: "var(--fg-5)" }}>
                  分组热区，请在子元素上调整坐标。
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {smil.length > 0 && (
        <section>
          <h4 style={SECTION_TITLE}>动画时间轴 ({smil.length})</h4>
          {smil.map((node) => (
            <div key={node.id} style={{ marginBottom: 12 }}>
              <div style={{ ...LABEL, marginBottom: 6, color: "var(--fg-2)" }} title={node.label}>
                {node.tag}
                {node.attributeName ? ` · ${node.attributeName}` : ""}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SmilInput
                  label="begin"
                  attr="begin"
                  aria-id={node.id}
                  value={node.begin}
                  onCommit={(next) => patchAttr(node.elementIndex, "begin", next)}
                />
                <SmilInput
                  label="dur"
                  attr="dur"
                  aria-id={node.id}
                  value={node.dur}
                  onCommit={(next) => patchAttr(node.elementIndex, "dur", next)}
                />
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
