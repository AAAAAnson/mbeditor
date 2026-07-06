// frontend/src/surfaces/compose/ComposeSurface.tsx
// 持 ComposePhase 状态机,编排 IntentInput / AskFlow / GeneratingTheater。
// done -> 写 articlesStore -> 导航 editor(由 GeneratingTheater 回调驱动)。
import { useState } from "react";
import type { CSSProperties } from "react";
import type { Route } from "@/types";
import IntentInput from "./IntentInput";
import AskFlow from "./AskFlow";
import GeneratingTheater from "./GeneratingTheater";
import ConnectAiWizard from "@/surfaces/onboarding/ConnectAiWizard";
import { getLlmConfig } from "@/surfaces/settings/llmApi";
import { useHealthStore } from "@/stores/healthStore";
import { IconArrowLeft } from "@/components/icons";
import { loadDraft, saveDraft } from "./composeDraft";

export type ComposePhase = "intent" | "asking" | "connect" | "generating" | "done";

export type Audience = "生活同好" | "行业同行" | "路人泛读";
export type Tone = "温柔治愈" | "干货利落" | "俏皮带梗" | "克制高级";

export interface ComposeAnswers {
  intent: string;
  audience: Audience | "";
  tone: Tone | "";
  voiceSample: string; // 「学笔法」textarea;跳过则空串
  useBrandVoice: boolean; // 是否注入已存音色档案
}

// 草稿的 key/格式/load/save 收进 composeDraft.ts(与首页一句话直达共用,防漂移)。
interface ComposeSurfaceProps {
  go: (route: Route, params?: Record<string, string>) => void;
}

const surfaceStyle: CSSProperties = {
  minHeight: "calc(100vh - var(--topbar-h))",
  background: "var(--bg)",
  color: "var(--ink)",
  fontFamily: "var(--f-sans)",
  display: "flex",
  flexDirection: "column",
};

const chromeStyle: CSSProperties = {
  minHeight: 56,
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "0 20px",
  borderBottom: "1px solid var(--line)",
  background: "color-mix(in srgb, var(--surface) 88%, transparent)",
  backdropFilter: "saturate(1.1) blur(8px)",
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const backButtonStyle: CSSProperties = {
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "0 14px 0 11px",
  borderRadius: "var(--r-md)",
  border: "none",
  background: "transparent",
  color: "var(--ink-soft)",
  font: "inherit",
  fontSize: 14,
  cursor: "pointer",
};

const phaseLabel: Record<ComposePhase, string> = {
  intent: "一句话起稿",
  asking: "几道选择题",
  connect: "连接 AI 写手",
  generating: "流式生成剧场",
  done: "草稿已生成",
};

export default function ComposeSurface({ go }: ComposeSurfaceProps) {
  // 首页一句话直达:进来时草稿里已有非空 intent(HomeSurface 主 CTA/Enter 写入,
  // 或刷新恢复),直接跳 asking 免得用户再打一遍;空白 intent 仍从头起稿。
  const [phase, setPhase] = useState<ComposePhase>(() =>
    loadDraft().intent.trim() ? "asking" : "intent",
  );
  const [answers, setAnswers] = useState<ComposeAnswers>(loadDraft);

  // 后端健康软判:连不上时进 compose 即顶部条幅预警,而非等连完 key 在生成中途才报错。
  const backendDown = useHealthStore((s) => s.status === "down");

  const patch = (p: Partial<ComposeAnswers>) =>
    setAnswers((prev) => {
      const next = { ...prev, ...p };
      saveDraft(next);
      return next;
    });

  // 进入生成前先确认已连 AI:未连则插入向导(connect),连好再续上生成。
  const startGenerate = async () => {
    try {
      const cfg = await getLlmConfig();
      setPhase(cfg.keyConfigured ? "generating" : "connect");
    } catch {
      // 读配置失败时不挡路:仍进生成,GeneratingTheater 会以 no_provider 友好兜底。
      setPhase("generating");
    }
  };

  return (
    <main data-testid="compose-surface" className="compose-surface u-page-in" style={surfaceStyle}>
      <div className="compose-chrome" style={chromeStyle}>
        <button type="button" className="compose-back" style={backButtonStyle} onClick={() => go("list")}>
          <IconArrowLeft size={15} />
          返回起稿台
        </button>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--orange-700)",
              textTransform: "uppercase",
            }}
          >
            MBEditor · 起稿台
          </div>
          <div style={{ marginTop: 2, fontSize: 13, color: "var(--ink-soft)" }}>{phaseLabel[phase]}</div>
        </div>
      </div>

      {backendDown && (
        <div
          role="alert"
          style={{
            margin: "16px auto 0",
            width: "min(920px, calc(100% - 32px))",
            padding: "10px 14px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--danger)",
            background: "var(--danger-soft)",
            color: "var(--danger)",
            fontSize: 12.5,
            lineHeight: 1.6,
          }}
        >
          写作服务暂连不上,先检查网络或稍后再试;现在可以照常起稿,等连上再生成。
        </div>
      )}

      {phase === "intent" && (
        <IntentInput
          value={answers.intent}
          onChange={(intent) => patch({ intent })}
          onSubmit={() => setPhase("asking")}
        />
      )}

      {phase === "asking" && (
        <AskFlow
          answers={answers}
          intentText={answers.intent}
          onPatch={patch}
          onStart={startGenerate}
          onBack={(target) => {
            if (target === "intent") {
              setPhase("intent");
              return;
            }
            go("list");
          }}
        />
      )}

      {phase === "connect" && (
        <ConnectAiWizard
          onConnected={() => setPhase("generating")}
          onCancel={() => go("settings", { section: "aiengine" })}
        />
      )}

      {(phase === "generating" || phase === "done") && (
        <GeneratingTheater
          answers={answers}
          onDone={() => setPhase("done")}
          onRetry={() => setPhase("asking")}
          go={go}
          onConnect={() => setPhase("connect")}
        />
      )}
    </main>
  );
}
