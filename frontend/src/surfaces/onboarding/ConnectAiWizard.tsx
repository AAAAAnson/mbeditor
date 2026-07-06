// frontend/src/surfaces/onboarding/ConnectAiWizard.tsx
// 连接 AI 图文向导:① 选服务商 ② 三步拿密钥 + 测试连接。测通才保存。
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { AI_PRESETS, type AiPreset } from "@/surfaces/settings/AIEngineSection";
import { putLlmConfig, testLlmConnection } from "@/surfaces/settings/llmApi";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClose,
  IconCopy,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconLock,
  IconSettings,
  IconSparkle,
} from "@/components/icons";
import BrandMark from "@/components/shared/BrandMark";
import BrandMarkCream from "@/components/shared/BrandMarkCream";
import deepseekSignupShot from "./assets/deepseek-signup.png";

interface ConnectAiWizardProps {
  onConnected: () => void;
  onCancel: () => void;
}

const PRESET_DESC: Record<string, string> = {
  deepseek: "国内手机号注册 · 按量计费 · 写一篇约几分钱",
  qwen: "阿里出品 · 中文老练",
  kimi: "Moonshot · 长文友好",
  claude: "Anthropic · 文笔细腻",
};

const PRESET_PRICE: Record<string, string> = {
  deepseek: "约 2 分 / 篇",
  qwen: "约 3 分 / 篇",
  kimi: "约 1 毛 / 篇",
  claude: "约 2 毛 / 篇",
};

const PRESET_MONO: Record<string, string> = {
  deepseek: "D",
  qwen: "通",
  kimi: "K",
  claude: "C",
};

const shellStyle: CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  display: "flex",
  background: "var(--surface)",
  color: "var(--ink)",
  overflow: "hidden",
};

const railStyle: CSSProperties = {
  position: "relative",
  flex: "0 0 416px",
  display: "flex",
  flexDirection: "column",
  background: "var(--ink-strong)",
  color: "var(--cream)",
  padding: "30px 38px 34px",
  overflow: "hidden",
};

const mainStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  background: "var(--surface)",
};

const innerStyle: CSSProperties = {
  padding: "38px 44px 34px",
  display: "flex",
  flexDirection: "column",
  minHeight: "100%",
};

// H3 移动适配:≤600px 时左轨 416px 会比屏还宽、右侧密钥区宽度归零 → 转纵向。
// 桌面(>600px)三个基线 style 原样直用,逐字节不变。
const shellMobileStyle: CSSProperties = {
  ...shellStyle,
  flexDirection: "column",
  overflowY: "auto",
};

const railMobileStyle: CSSProperties = {
  ...railStyle,
  flex: "0 0 auto",
  width: "100%",
  padding: "22px 20px 26px",
};

const mainMobileStyle: CSSProperties = {
  ...mainStyle,
  flex: "1 1 auto",
  overflowY: "visible",
};

const innerMobileStyle: CSSProperties = {
  ...innerStyle,
  padding: "26px 18px 30px",
};

function providerMono(id: string) {
  return PRESET_MONO[id] ?? id.slice(0, 1).toUpperCase();
}

function ProviderTile({ id, rec = false }: { id: string; rec?: boolean }) {
  return (
    <span
      style={{
        width: 40,
        height: 40,
        borderRadius: 11,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        fontFamily: "var(--f-display)",
        fontWeight: 700,
        fontSize: 18,
        lineHeight: 1,
        background: rec ? "var(--ink-strong)" : "var(--bg-sunk)",
        color: rec ? "var(--cream)" : "var(--ink-strong)",
        boxShadow: rec ? "none" : "inset 0 0 0 1px var(--line)",
      }}
      aria-hidden="true"
    >
      {providerMono(id)}
    </span>
  );
}

function Dot() {
  return <span style={{ width: 7, height: 7, borderRadius: 7, background: "var(--line-strong)" }} />;
}

function CreateKeyArt() {
  return (
    <svg viewBox="0 0 300 116" width="100%" height="116" role="img" aria-label="控制台创建 API Key 示意" fill="none">
      <rect x="8" y="10" width="284" height="96" rx="6" fill="var(--bg)" stroke="var(--line)" />
      <text x="20" y="30" fontSize="11" fill="var(--ink-soft)" fontFamily="sans-serif">API Keys</text>
      <rect x="196" y="18" width="84" height="22" rx="5" fill="var(--orange-500)" />
      <text x="238" y="33" fontSize="11" fill="var(--cream)" textAnchor="middle" fontFamily="sans-serif">新建密钥</text>
      <rect x="20" y="52" width="200" height="20" rx="4" fill="var(--surface-2)" stroke="var(--line)" />
      <text x="28" y="66" fontSize="11" fill="var(--ink-soft)" fontFamily="monospace">sk-•••••••••••••••••</text>
      <rect x="228" y="52" width="52" height="20" rx="4" fill="none" stroke="var(--orange-500)" />
      <text x="254" y="66" fontSize="10" fill="var(--orange-700)" textAnchor="middle" fontFamily="sans-serif">复制</text>
      <text x="20" y="92" fontSize="9.5" fill="var(--ink-faint)" fontFamily="sans-serif">密钥只显示一次,记得马上复制保存</text>
    </svg>
  );
}

function PasteKeyArt() {
  return (
    <svg viewBox="0 0 300 116" width="100%" height="116" role="img" aria-label="粘贴密钥并连接示意" fill="none">
      <text x="20" y="28" fontSize="10" fill="var(--ink-faint)" fontFamily="sans-serif">API Key</text>
      <rect x="20" y="36" width="260" height="26" rx="4" fill="var(--surface-2)" stroke="var(--orange-500)" />
      <text x="28" y="53" fontSize="12" fill="var(--ink)" fontFamily="monospace">sk-••••••••••••••••••</text>
      <rect x="206" y="14" width="74" height="16" rx="8" fill="var(--surface)" stroke="var(--line)" />
      <text x="243" y="25" fontSize="9.5" fill="var(--ink-soft)" textAnchor="middle" fontFamily="sans-serif">粘贴</text>
      <rect x="20" y="78" width="96" height="24" rx="6" fill="var(--orange-500)" />
      <text x="68" y="94" fontSize="11" fill="var(--cream)" textAnchor="middle" fontFamily="sans-serif">测试并连接</text>
      <text x="128" y="94" fontSize="9.5" fill="var(--ink-faint)" fontFamily="sans-serif">连上就能开始写</text>
    </svg>
  );
}

function StepShot({ step, label }: { step: number; label: string }) {
  return (
    <figure
      data-testid={`placeholder-step-${step}`}
      style={{
        margin: "0 0 14px",
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--line-strong)",
        background: "var(--surface)",
        overflow: "hidden",
        boxShadow: "var(--sh-xs)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          height: 20,
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "0 8px",
          background: "var(--bg-sunk)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Dot />
        <Dot />
        <Dot />
        <span style={{ marginLeft: 6, flex: 1, height: 8, borderRadius: 4, background: "var(--line)" }} />
      </div>
      <div style={{ minHeight: 116, padding: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {step === 1 ? (
          <img
            src={deepseekSignupShot}
            alt="DeepSeek 开放平台注册页:手机号注册"
            title={label}
            style={{ display: "block", maxWidth: "100%", maxHeight: 180, borderRadius: 3 }}
          />
        ) : step === 2 ? (
          <CreateKeyArt />
        ) : (
          <PasteKeyArt />
        )}
      </div>
    </figure>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--ink-faint)",
        marginBottom: 22,
      }}
    >
      {children}
      <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
    </div>
  );
}

export default function ConnectAiWizard({ onConnected, onCancel }: ConnectAiWizardProps) {
  const isMobile = useIsMobile();
  const [presetId, setPresetId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  // H4:测试失败归因(quota/auth/network/other)。quota 时错误卡给「去充值」出路。
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const preset: AiPreset | null = presetId ? AI_PRESETS[presetId] : null;
  const step = preset ? 2 : 1;

  const handleConnect = async () => {
    if (!preset) return;
    setBusy(true);
    setErrorText(null);
    setErrorCode(null);
    try {
      const patch = {
        provider: preset.provider,
        base_url: preset.base_url,
        model: preset.model,
        api_key: apiKey,
      };
      const res = await testLlmConnection(patch);
      if (!res.ok) {
        setErrorText(res.detail || "连接失败,请检查密钥");
        setErrorCode(res.code ?? null);
        return;
      }
      await putLlmConfig(patch);
      onConnected();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "连接失败,请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="connect-wizard" data-testid="connect-ai-wizard" style={isMobile ? shellMobileStyle : shellStyle}>
      <aside data-testid="connect-ai-rail" style={isMobile ? railMobileStyle : railStyle}>
        <span style={{ position: "absolute", right: -58, bottom: -46, opacity: 0.05, pointerEvents: "none" }}>
          <BrandMarkCream size={230} />
        </span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, zIndex: 1 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <BrandMark size={28} />
            <span style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 18, letterSpacing: ".03em" }}>
              MBEditor
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              if (preset) {
                setPresetId(null);
                setErrorText(null);
                setErrorCode(null);
                setApiKey("");
              } else {
                onCancel();
              }
            }}
            style={{
              minHeight: 36,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "0 12px 0 9px",
              borderRadius: "var(--r-pill)",
              background: "color-mix(in srgb, var(--cream) 7%, transparent)",
              border: "1px solid color-mix(in srgb, var(--cream) 14%, transparent)",
              color: "color-mix(in srgb, var(--cream) 74%, transparent)",
              font: "inherit",
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            <IconArrowLeft size={15} />
            {preset ? "上一步" : "返回"}
          </button>
        </div>

        <div style={{ zIndex: 1, marginTop: isMobile ? 14 : 42 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: step === 1 ? "var(--orange-300)" : "color-mix(in srgb, var(--cream) 50%, transparent)" }}>
              01 选服务商
            </span>
            <span style={{ flex: 1, maxWidth: 42, height: 1, background: "color-mix(in srgb, var(--cream) 20%, transparent)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: step === 2 ? "var(--orange-300)" : "color-mix(in srgb, var(--cream) 50%, transparent)" }}>
              02 连接测试
            </span>
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--f-display)",
              fontWeight: 700,
              fontSize: isMobile ? 24 : 35,
              lineHeight: 1.18,
              color: "var(--cream)",
            }}
          >
            {preset ? (
              <>
                连接 <span style={{ color: "var(--orange-300)" }}>{preset.label}</span>
              </>
            ) : (
              <>
                连上你自己的
                <br />
                <span style={{ color: "var(--orange-300)" }}>AI 写手</span>
              </>
            )}
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "color-mix(in srgb, var(--cream) 72%, transparent)", margin: "16px 0 0", maxWidth: 310 }}>
            {preset
              ? isMobile
                ? "照下面三步拿到密钥,粘进来测一下;测通了才会保存。"
                : "照右边三步拿到密钥,粘进来测一下;测通了才会保存。"
              : isMobile
                ? "选一个就好,连一次以后都不用再连。"
                : "选一个就好,连一次以后都不用再连。下面这两件事,先讲清楚。"}
          </p>
        </div>

        {/* 窄屏收起两张科普卡:同信息在密钥步脚注与 no_provider 弹窗已有,
            留着会把服务商列表/密钥输入整屏挤出首屏(H3 QA 逮到)。 */}
        {!isMobile && (
        <div style={{ zIndex: 1, marginTop: "auto", paddingTop: 30 }}>
          <div style={{ display: "flex", gap: 13, padding: "17px 0", borderTop: "1px solid color-mix(in srgb, var(--cream) 13%, transparent)" }}>
            <span
              style={{
                width: 26,
                height: 26,
                flex: "none",
                marginTop: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                border: "1px solid color-mix(in srgb, var(--cream) 28%, transparent)",
                color: "var(--orange-300)",
              }}
            >
              <IconSparkle size={14} />
            </span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--cream)", marginBottom: 5 }}>要花钱吗?几分钱</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.62, color: "color-mix(in srgb, var(--cream) 66%, transparent)" }}>
                用自己的 AI 账号写(BYOK),不经过我们的服务器。按量付费,一篇通常就几分钱,具体以 AI 官网为准。
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 13, padding: "17px 0", borderTop: "1px solid color-mix(in srgb, var(--cream) 13%, transparent)" }}>
            <span
              style={{
                width: 26,
                height: 26,
                flex: "none",
                marginTop: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                border: "1px solid color-mix(in srgb, var(--cream) 28%, transparent)",
                color: "var(--orange-300)",
              }}
            >
              <IconLock size={13} />
            </span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--cream)", marginBottom: 5 }}>密钥安全吗?不外传</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.62, color: "color-mix(in srgb, var(--cream) 66%, transparent)" }}>
                密钥只存你的本机 / 本服务端,绝不上传任何第三方,也不进浏览器存储。
              </div>
            </div>
          </div>
        </div>
        )}
        <div style={{ zIndex: 1, display: "flex", alignItems: "center", gap: 8, marginTop: isMobile ? 14 : 18, fontSize: 11.5, color: "color-mix(in srgb, var(--cream) 50%, transparent)" }}>
          <IconLock size={12} />
          写后不回显 · 测通才放行
        </div>
      </aside>

      <div style={isMobile ? mainMobileStyle : mainStyle}>
        <div style={isMobile ? innerMobileStyle : innerStyle}>
          {!preset ? (
            <>
              <Eyebrow>选一个 AI 服务商</Eyebrow>
              <div role="list" style={{ display: "flex", flexDirection: "column" }}>
                {Object.entries(AI_PRESETS).map(([id, item]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setPresetId(id);
                      setErrorText(null);
                      setErrorCode(null);
                      setApiKey("");
                    }}
                    style={{
                      position: "relative",
                      minHeight: 74,
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: "17px 12px 17px 16px",
                      cursor: "pointer",
                      border: 0,
                      borderBottom: "1px solid var(--line)",
                      background: "none",
                      font: "inherit",
                      textAlign: "left",
                    }}
                  >
                    {item.rec && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 13,
                          bottom: 13,
                          width: 3,
                          borderRadius: 2,
                          background: "var(--orange-500)",
                        }}
                      />
                    )}
                    <ProviderTile id={id} rec={item.rec} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 15.5, fontWeight: 700, color: "var(--ink-strong)" }}>
                        {item.label}
                        {item.rec && (
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              letterSpacing: 1,
                              color: "var(--orange-600)",
                              border: "1px solid var(--orange-300)",
                              borderRadius: "var(--r-pill)",
                              padding: "1px 8px",
                              lineHeight: 1.5,
                            }}
                          >
                            推荐
                          </span>
                        )}
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-soft)", marginTop: 3 }}>
                        {PRESET_DESC[id] ?? item.provider}
                      </span>
                    </span>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                      {PRESET_PRICE[id] ?? "以官网为准"}
                    </span>
                    <IconArrowRight size={18} />
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                <button
                  type="button"
                  onClick={onCancel}
                  style={{
                    minHeight: 44,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    border: "none",
                    background: "transparent",
                    color: "var(--ink-soft)",
                    font: "inherit",
                    fontSize: 13.5,
                    cursor: "pointer",
                    padding: "6px 2px",
                  }}
                >
                  <IconSettings size={15} />
                  还没准备好?我先去设置里配置
                </button>
              </div>
            </>
          ) : (
            <>
              <Eyebrow>三步拿到密钥</Eyebrow>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r-md)",
                  padding: "12px 14px",
                  marginBottom: 30,
                  background: "var(--surface-2)",
                }}
              >
                <ProviderTile id={presetId as string} rec={Boolean(preset.rec)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink-strong)" }}>{preset.label}</div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
                    已选择 · 测通后保存
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setPresetId(null);
                    setErrorText(null);
                    setErrorCode(null);
                    setApiKey("");
                  }}
                >
                  换一个
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 22, marginBottom: 32 }}>
                <div>
                  <StepShot step={1} label="注册账号" />
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 22, color: "var(--orange-500)" }}>1</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-strong)" }}>注册账号</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.55, paddingLeft: 32 }}>
                    打开服务商官网注册并实名。价格与可用性以官网为准。
                  </div>
                </div>
                <div>
                  <StepShot step={2} label="创建密钥" />
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 22, color: "var(--orange-500)" }}>2</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-strong)" }}>新建密钥</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.55, paddingLeft: 32 }}>
                    进 API Keys / 密钥管理,点新建,起个名字。
                  </div>
                </div>
                <div>
                  <StepShot step={3} label="复制粘贴" />
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 22, color: "var(--orange-500)" }}>3</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-strong)" }}>复制粘贴</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.55, paddingLeft: 32 }}>
                    把 sk- 开头的密钥复制,粘到下面。
                  </div>
                </div>
              </div>

              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--success-ink)", fontWeight: 700, marginBottom: 18 }}>
                <IconCheck size={15} />
                接口地址与模型已按 {preset.label} 自动填好,不用改。
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 24, marginBottom: 22 }}>
                <div style={{ paddingBottom: 9, borderBottom: "1px solid var(--line-strong)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "var(--ink-faint)", marginBottom: 7 }}>
                    base_url <IconLock size={11} />
                  </div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {preset.base_url || "(官方默认)"}
                  </div>
                </div>
                <div style={{ paddingBottom: 9, borderBottom: "1px solid var(--line-strong)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "var(--ink-faint)", marginBottom: 7 }}>
                    model <IconLock size={11} />
                  </div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--ink)" }}>{preset.model}</div>
                </div>
              </div>

              <label style={{ display: "block", marginBottom: 18 }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-strong)" }}>API Key</span>
                  <a
                    href={preset.console_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--orange-700)",
                      textDecoration: "none",
                    }}
                  >
                    去 {preset.label} 控制台获取 / 充值
                    <IconExternal size={12} />
                  </a>
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    borderRadius: "var(--r-md)",
                    border: `1px solid ${errorText ? "var(--danger)" : "var(--line-strong)"}`,
                    background: "var(--surface)",
                    padding: "0 12px",
                    minHeight: 48,
                  }}
                >
                  <IconLock size={16} />
                  <input
                    aria-label="API Key"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      if (errorText) {
                        setErrorText(null);
                        setErrorCode(null);
                      }
                    }}
                    placeholder="sk-..."
                    autoFocus
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      color: "var(--ink)",
                      fontFamily: "var(--f-mono)",
                      fontSize: 13,
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                    aria-pressed={showKey}
                    onClick={() => setShowKey((v) => !v)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "var(--r-sm)",
                      border: "none",
                      background: "transparent",
                      color: "var(--ink-faint)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    {showKey ? <IconEyeOff size={17} /> : <IconEye size={17} />}
                  </button>
                </span>
                {!errorText && (
                  <span style={{ display: "block", marginTop: 7, color: "var(--ink-faint)", fontSize: 12 }}>
                    粘贴上一步复制的密钥;只存本机 / 服务端,我们看不到。
                  </span>
                )}
              </label>

              {errorText && (
                <div
                  role="alert"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    background: "var(--danger-soft)",
                    borderLeft: "3px solid var(--danger)",
                    borderRadius: "var(--r-sm)",
                    padding: "14px 16px",
                    marginBottom: 18,
                    color: "var(--danger-ink)",
                  }}
                >
                  <IconClose size={17} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>没连上,先没保存</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 4 }}>
                      {(errorText ?? "").replace(/[。.\s]+$/, "")}。改好再点一次「测试并连接」,测通了才会保存。
                    </div>
                    {errorCode === "quota" && (
                      <div style={{ marginTop: 8 }}>
                        <a
                          href={preset.console_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: "var(--danger-ink)",
                            textDecoration: "underline",
                          }}
                        >
                          去 {preset.label} 控制台充值
                          <IconExternal size={12} />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "auto", paddingTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setPresetId(null);
                    setErrorText(null);
                    setErrorCode(null);
                    setApiKey("");
                  }}
                >
                  换个服务商
                </button>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !apiKey.trim()}
                  onClick={handleConnect}
                  style={{ minHeight: 44 }}
                >
                  {busy ? "连接中..." : "测试并连接"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--ink-faint)", marginTop: 16, lineHeight: 1.5 }}>
                <IconLock size={12} />
                测通才放行 · 密钥只存本机 / 服务端、写后不回显,绝不上传第三方。
                <IconExternal size={12} />
                价格以官网为准
                <IconCopy size={12} />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
