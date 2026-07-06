// frontend/src/surfaces/compose/IntentInput.tsx
// 起稿第一屏:一句话大输入框 + 灵感胶囊。回车(Ctrl/Cmd+Enter)或点「落笔」-> onSubmit。
import { useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactElement } from "react";
import {
  IconBook,
  IconEdit,
  IconMic,
  IconPin,
  IconSparkle,
  IconStore,
  IconStroller,
  type IconProps,
} from "@/components/icons";

const INSPO: { label: string; seed: string; Icon: (props: IconProps) => ReactElement }[] = [
  {
    label: "带娃日记",
    seed: "今天带娃去公园,他第一次自己荡秋千,荡得老高还回头冲我笑,那一瞬间觉得他突然长大了。",
    Icon: IconStroller,
  },
  {
    label: "读书手记",
    seed: "这周读完一本书,最打动我的是结尾那几句话,想把当时的几点感想认真记下来。",
    Icon: IconBook,
  },
  {
    label: "上新札记",
    seed: "小店这周上了几款新东西,想写一篇好看的上新札记,介绍给一直关照的老顾客。",
    Icon: IconStore,
  },
  {
    label: "本地探店",
    seed: "周末去了家新开的咖啡馆,环境很安静、一杯手冲也用心,想安利给附近的街坊。",
    Icon: IconPin,
  },
];

interface IntentInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

const screenStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "48px 28px 60px",
  overflowY: "auto",
};

const wrapStyle: CSSProperties = {
  width: "100%",
  maxWidth: 680,
  display: "flex",
  flexDirection: "column",
};

const greetStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  alignSelf: "flex-start",
  minHeight: 32,
  padding: "0 14px 0 11px",
  borderRadius: "var(--r-pill)",
  background: "var(--orange-50)",
  color: "var(--orange-700)",
  fontSize: 13,
  fontWeight: 600,
  border: "1px solid var(--orange-100)",
  marginBottom: 18,
};

const inputCardBase: CSSProperties = {
  position: "relative",
  display: "flex",
  gap: 14,
  background: "var(--surface)",
  border: "1.5px solid var(--line-strong)",
  borderRadius: "var(--r-xl)",
  padding: "20px 20px 18px",
  boxShadow: "var(--sh-sm)",
};

const micStyle: CSSProperties = {
  flex: "none",
  width: 42,
  height: 42,
  borderRadius: "50%",
  background: "var(--orange-50)",
  color: "var(--orange-500)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 2,
};

const textAreaStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  resize: "vertical",
  fontFamily: "var(--f-sans)",
  fontSize: 18,
  lineHeight: 1.7,
  color: "var(--ink)",
  minHeight: 112,
  padding: "7px 0 0",
};

export default function IntentInput({ value, onChange, onSubmit }: IntentInputProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const canSubmit = value.trim().length > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (canSubmit) onSubmit();
    }
  };

  return (
    <section className="intent-screen" style={screenStyle}>
      <div style={wrapStyle}>
        <span style={greetStyle}>
          <IconSparkle size={15} />
          第一次来呀,随口讲一句就行
        </span>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--f-display)",
            fontWeight: 700,
            fontSize: "clamp(27px, 3.8vw, 38px)",
            lineHeight: 1.2,
            color: "var(--ink-strong)",
          }}
        >
          <span>想写点什么?</span>
          <span style={{ color: "var(--orange-600)" }}>讲给我听</span>就好
        </h1>
        <p style={{ margin: "14px 0 28px", maxWidth: 520, fontSize: 15.5, lineHeight: 1.7, color: "var(--ink-soft)" }}>
          用大白话说一句你想写的事,我来帮你写成一篇排版好看、能直接发的公众号推文。
        </p>

        <div
          className="intent-input-card"
          style={{
            ...inputCardBase,
            borderColor: focused ? "var(--orange-400)" : "var(--line-strong)",
            boxShadow: focused ? "var(--ring), var(--sh-md)" : "var(--sh-sm)",
          }}
        >
          <span style={micStyle} aria-hidden="true">
            <IconMic size={20} />
          </span>
          <textarea
            ref={textAreaRef}
            aria-label="一句话意图"
            placeholder="比如:今天带娃去公园,他第一次自己荡秋千,荡得老高还回头冲我笑..."
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            style={textAreaStyle}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={() => canSubmit && onSubmit()}
            style={{ minHeight: 44 }}
          >
            <IconEdit size={17} />
            落笔
          </button>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink-faint)" }}>
            <span
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                fontWeight: 600,
                background: "var(--bg-sunk)",
                border: "1px solid var(--line-strong)",
                borderBottomWidth: 2,
                borderRadius: 5,
                padding: "1px 7px",
                color: "var(--ink-soft)",
              }}
            >
              Ctrl / Cmd
            </span>
            <span
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                fontWeight: 600,
                background: "var(--bg-sunk)",
                border: "1px solid var(--line-strong)",
                borderBottomWidth: 2,
                borderRadius: 5,
                padding: "1px 7px",
                color: "var(--ink-soft)",
              }}
            >
              Enter
            </span>
            也能落笔
          </span>
          {canSubmit && (
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-faint)", fontVariantNumeric: "tabular-nums" }}>
              {value.trim().length} 字
            </span>
          )}
        </div>

        <div style={{ marginTop: 38, paddingTop: 26, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-soft)", marginBottom: 14 }}>
            <span style={{ color: "var(--orange-500)" }}>
              <IconSparkle size={15} />
            </span>
            不知道写啥?点一个,我先帮你起个头
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 11 }}>
            {INSPO.map(({ label, seed, Icon }) => (
              <button
                key={label}
                type="button"
                className="intent-chip"
                onClick={() => {
                  onChange(seed);
                  textAreaRef.current?.focus();
                }}
                style={{
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "0 18px",
                  borderRadius: "var(--r-pill)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  border: "1.5px solid var(--line-strong)",
                  font: "inherit",
                  fontSize: 14.5,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <span style={{ color: "var(--orange-500)", display: "flex" }}>
                  <Icon size={17} />
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
