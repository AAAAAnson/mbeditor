// frontend/src/surfaces/compose/AskFlow.tsx
// 三道选择题:受众/调子必选,旧文风格可跳过。「开始写」-> onStart。
import type { CSSProperties, ReactNode } from "react";
import { IconArrowLeft, IconBook, IconCheck, IconEdit, IconInfo, IconSparkle } from "@/components/icons";
import type { Audience, ComposeAnswers, Tone } from "./ComposeSurface";

const AUDIENCES: { name: Audience; desc: string }[] = [
  { name: "生活同好", desc: "爱记录日常的人" },
  { name: "行业同行", desc: "懂一点背景的同行" },
  { name: "路人泛读", desc: "第一次刷到也能懂" },
];

const TONES: { name: Tone; desc: string }[] = [
  { name: "温柔治愈", desc: "像朋友聊天" },
  { name: "干货利落", desc: "条理分明、好读" },
  { name: "俏皮带梗", desc: "轻松活泼一点" },
  { name: "克制高级", desc: "讲究字句和留白" },
];

interface AskFlowProps {
  answers: ComposeAnswers;
  intentText?: string;
  onPatch: (patch: Partial<ComposeAnswers>) => void;
  onStart: () => void;
  onBack?: (target: "list" | "intent") => void;
}

const screenStyle: CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  background: "var(--bg)",
};

const topStyle: CSSProperties = {
  minHeight: 56,
  flex: "none",
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "0 20px",
  borderBottom: "1px solid var(--line)",
  background: "color-mix(in srgb, var(--surface) 88%, transparent)",
};

const scrollStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "36px 28px 28px",
};

const wrapStyle: CSSProperties = {
  width: "100%",
  maxWidth: 680,
  display: "flex",
  flexDirection: "column",
};

const recapStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-lg)",
  padding: "14px 16px",
  marginBottom: 30,
};

const qStyle: CSSProperties = {
  marginBottom: 30,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 11,
  paddingLeft: 28,
};

const chipStyle: CSSProperties = {
  minHeight: 44,
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  gap: 2,
  padding: "7px 17px",
  borderRadius: "var(--r-lg)",
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1.5px solid var(--line-strong)",
  font: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

function Question({
  n,
  title,
  hintLabel,
  hint,
  required,
  children,
  example,
}: {
  n: string;
  title: string;
  hintLabel: string;
  hint: string;
  required?: boolean;
  example: string;
  children: ReactNode;
}) {
  return (
    <section style={qStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 11, marginBottom: 5 }}>
        <span style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 17, color: "var(--orange-500)" }}>
          {n}
        </span>
        <span
          style={{
            fontSize: 16.5,
            fontWeight: 700,
            color: "var(--ink-strong)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {title}
          <span
            title={hint}
            style={{
              flex: "none",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              padding: "1px 8px",
              borderRadius: "var(--r-pill)",
              border: "1px solid var(--line)",
              background: "var(--bg-sunk)",
              color: "var(--ink-faint)",
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1.5,
              cursor: "help",
            }}
          >
            {hintLabel}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: required ? "var(--orange-600)" : "var(--ink-faint)",
              background: required ? "var(--orange-50)" : "var(--bg-sunk)",
              border: `1px solid ${required ? "var(--orange-100)" : "var(--line)"}`,
              borderRadius: "var(--r-pill)",
              padding: "1px 8px",
            }}
          >
            {required ? "必选" : "可跳过"}
          </span>
        </span>
      </div>
      <p style={{ margin: "0 0 14px", paddingLeft: 28, fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 }}>
        {example}
      </p>
      {children}
    </section>
  );
}

export default function AskFlow({
  answers,
  intentText = answers.intent,
  onPatch,
  onStart,
  onBack = () => {},
}: AskFlowProps) {
  const canStart = answers.audience !== "" && answers.tone !== "";
  const readyLabel = !answers.audience && !answers.tone
    ? "还需选「受众」和「调子」"
    : !answers.audience
      ? "还差「受众」没选"
      : !answers.tone
        ? "还差「调子」没选"
        : "都选好啦,可以开始写";

  return (
    <section className="ask-screen" style={screenStyle}>
      <div className="ask-top" style={topStyle}>
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--ink-soft)", fontSize: 13, fontWeight: 600 }}>快好了 · 还剩 3 个小选择</span>
      </div>

      <div style={scrollStyle}>
        <div style={wrapStyle}>
          <div style={recapStyle}>
            <span
              style={{
                flex: "none",
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "var(--orange-50)",
                color: "var(--orange-500)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
              }}
            >
              <IconEdit size={15} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--ink-faint)", marginBottom: 3 }}>
                你想写的
              </div>
              <div style={{ fontFamily: "var(--f-display)", fontSize: 15.5, lineHeight: 1.6, color: "var(--ink)" }}>
                {intentText || "先讲一句你想写的事"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onBack("intent")}
              style={{
                minHeight: 44,
                flex: "none",
                alignSelf: "center",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                border: "none",
                background: "transparent",
                color: "var(--orange-700)",
                font: "inherit",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                padding: "6px 8px",
                borderRadius: "var(--r-sm)",
              }}
            >
              <IconArrowLeft size={14} />
              改一下
            </button>
          </div>

          <p
            style={{
              fontFamily: "var(--f-display)",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--ink-strong)",
              margin: "0 0 24px",
              lineHeight: 1.4,
            }}
          >
            动笔前,先回答两个小问题,我好照着你的心意写。
          </p>

          <Question
            n="01"
            title="这篇写给谁看？"
            hintLabel="受众"
            hint="受众 = 给谁看 / 读者 / 对象。定下来,用词和举的例子都会更贴近他们。"
            required
            example="比如：发在自己朋友圈、给街坊邻居看，就选『生活同好』。"
          >
            <div style={chipRowStyle}>
              {AUDIENCES.map(({ name, desc }) => {
                const selected = answers.audience === name;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    aria-pressed={selected}
                    className={`ask-chip${selected ? " on" : ""}`}
                    onClick={() => onPatch({ audience: name })}
                    style={{
                      ...chipStyle,
                      background: selected ? "var(--orange-500)" : "var(--surface)",
                      color: selected ? "var(--cream)" : "var(--ink)",
                      borderColor: selected ? "var(--orange-500)" : "var(--line-strong)",
                    }}
                  >
                    <span style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.4 }}>{name}</span>
                    <span aria-hidden="true" style={{ fontSize: 11.5, opacity: selected ? 0.78 : 0.7, lineHeight: 1.3 }}>
                      {desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </Question>

          <Question
            n="02"
            title="想要什么调子？"
            hintLabel="语气"
            hint="调子 = 文章的口吻、语气、腔调和风格。决定用词的冷暖、句子的松紧。"
            required
            example="比如：哄睡时跟孩子说话的口气，选『温柔治愈』。"
          >
            <div style={chipRowStyle}>
              {TONES.map(({ name, desc }) => {
                const selected = answers.tone === name;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    aria-pressed={selected}
                    className={`ask-chip${selected ? " on" : ""}`}
                    onClick={() => onPatch({ tone: name })}
                    style={{
                      ...chipStyle,
                      background: selected ? "var(--orange-500)" : "var(--surface)",
                      color: selected ? "var(--cream)" : "var(--ink)",
                      borderColor: selected ? "var(--orange-500)" : "var(--line-strong)",
                    }}
                  >
                    <span style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.4 }}>{name}</span>
                    <span aria-hidden="true" style={{ fontSize: 11.5, opacity: selected ? 0.78 : 0.7, lineHeight: 1.3 }}>
                      {desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </Question>

          <Question
            n="03"
            title="参考我以前的文章"
            hintLabel="学你的语气"
            hint="贴一篇你写过的旧文,我照着学你的用词、口头禅和断句,写出来更像你本人。"
            example="比如：贴一篇你以前发过的推文，写出来就有你的味道；没写过也没关系。"
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 13, paddingLeft: 28 }}>
              <button
                type="button"
                aria-pressed={answers.useBrandVoice}
                onClick={() => onPatch({ useBrandVoice: true })}
                style={{
                  minHeight: 88,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "16px 17px",
                  borderRadius: "var(--r-lg)",
                  background: answers.useBrandVoice ? "var(--orange-50)" : "var(--surface)",
                  border: `1.5px solid ${answers.useBrandVoice ? "var(--orange-500)" : "var(--line-strong)"}`,
                  color: "var(--ink)",
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: answers.useBrandVoice ? "var(--orange-600)" : "var(--ink-soft)" }}>
                    <IconBook size={17} />
                  </span>
                  <span style={{ fontWeight: 700 }}>贴一篇我写过的</span>
                  {answers.useBrandVoice && <IconCheck size={15} />}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.55 }}>
                  把以前的推文贴进来,我学你的语气、口头禅、断句节奏。
                </span>
              </button>
              <button
                type="button"
                aria-pressed={!answers.useBrandVoice}
                onClick={() => onPatch({ useBrandVoice: false, voiceSample: "" })}
                style={{
                  minHeight: 88,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "16px 17px",
                  borderRadius: "var(--r-lg)",
                  background: !answers.useBrandVoice ? "var(--orange-50)" : "var(--surface)",
                  border: `1.5px solid ${!answers.useBrandVoice ? "var(--orange-500)" : "var(--line-strong)"}`,
                  color: "var(--ink)",
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: !answers.useBrandVoice ? "var(--orange-600)" : "var(--ink-soft)" }}>
                    <IconSparkle size={17} />
                  </span>
                  <span style={{ fontWeight: 700 }}>我还没写过</span>
                  {!answers.useBrandVoice && <IconCheck size={15} />}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.55 }}>
                  那先照上面的调子来,写着写着会越来越像你。
                </span>
              </button>
            </div>
            {answers.useBrandVoice && (
              <div style={{ margin: "14px 0 0 28px" }}>
                <label style={{ display: "block" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 7 }}>
                    <IconEdit size={14} />
                    把你喜欢的那段文字贴在这里
                  </span>
                  <textarea
                    aria-label="贴一篇旧文"
                    placeholder="粘贴一段你欣赏的文字(一两段就够)。我会学它怎么开头、怎么收尾、用什么样的句子。"
                    value={answers.voiceSample}
                    onChange={(event) => onPatch({ voiceSample: event.target.value })}
                    style={{
                      width: "100%",
                      minHeight: 112,
                      boxSizing: "border-box",
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--line-strong)",
                      background: "var(--surface)",
                      color: "var(--ink)",
                      font: "inherit",
                      lineHeight: 1.65,
                      padding: 12,
                      resize: "vertical",
                    }}
                  />
                </label>
              </div>
            )}
          </Question>
        </div>
      </div>

      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 28px",
          borderTop: "1px solid var(--line)",
          background: "color-mix(in srgb, var(--surface) 92%, transparent)",
          backdropFilter: "blur(8px)",
          zIndex: 5,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: canStart ? "var(--success-ink)" : "var(--ink-soft)",
            fontWeight: canStart ? 700 : 400,
          }}
        >
          {canStart ? <IconCheck size={16} /> : <IconInfo size={15} />}
          {readyLabel}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canStart}
          onClick={() => canStart && onStart()}
          style={{ minHeight: 44 }}
        >
          <IconSparkle size={17} />
          开始写
        </button>
      </div>
    </section>
  );
}
