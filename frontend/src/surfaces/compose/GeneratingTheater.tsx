// frontend/src/surfaces/compose/GeneratingTheater.tsx
// 消费 SSE:五工序竖轨 + 逐字手稿 + 成功/错误浮层。done -> 写 articlesStore。
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Route } from "@/types";
import type { AgentErrorCode, AgentEvent } from "@/types/agent";
import { agentStream, type AgentStreamHandle } from "@/lib/agentStream";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useArticlesStore } from "@/stores/articlesStore";
import { postRevision } from "@/lib/revisionsApi";
import { useWeChatPushable } from "@/hooks/useWeChatPushable";
import { buildArticleSlug } from "@/lib/route";
import { CheckBurst } from "@/components/ui";
import { IconCheck, IconCopy, IconEye, IconInfo, IconLock, IconRefresh, IconSend, IconSparkle, IconWarn } from "@/components/icons";
import type { ComposeAnswers } from "./ComposeSurface";

type StageName = "立意" | "行文" | "制版" | "自检" | "核验";
type StageStatus = "pending" | "active" | "done";

const STAGES: { name: StageName; desc: string }[] = [
  { name: "立意", desc: "想个开头,定个调子" },
  { name: "行文", desc: "一个字一个字往下写" },
  { name: "制版", desc: "分段、配色、排版式" },
  { name: "自检", desc: "检查能不能贴进公众号" },
  { name: "核验", desc: "最后过一遍兼容性" },
];

interface GeneratingTheaterProps {
  answers: ComposeAnswers;
  onDone: () => void;
  onRetry: () => void;
  go: (route: Route, params?: Record<string, string>) => void;
  // no_provider 时唤起连接 AI 向导(由 ComposeSurface 提供);未传则回退导航 settings。
  onConnect?: () => void;
}

const rootStyle: CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  background: "var(--bg)",
  color: "var(--ink)",
  overflow: "hidden",
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

const stageStyle: CSSProperties = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "344px 1fr",
  minHeight: 0,
};

const railStyle: CSSProperties = {
  padding: "30px 26px",
  borderRight: "1px solid var(--line)",
  background: "linear-gradient(180deg, var(--surface-2), var(--bg) 70%)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflowY: "auto",
};

const paperWrapStyle: CSSProperties = {
  overflowY: "auto",
  padding: 34,
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  minHeight: 0,
};

// H3 移动适配:≤600px 时 "344px 1fr" 只给手稿区留 ~46px → 单列(工序轨在上、
// 手稿纸在下),整个 stage 作为一个滚动区。桌面基线 style 原样直用,逐字节不变。
const stageMobileStyle: CSSProperties = {
  ...stageStyle,
  gridTemplateColumns: "1fr",
  overflowY: "auto",
};

const railMobileStyle: CSSProperties = {
  ...railStyle,
  borderRight: "none",
  borderBottom: "1px solid var(--line)",
  overflowY: "visible",
  minHeight: "auto",
  padding: "22px 18px",
};

const paperWrapMobileStyle: CSSProperties = {
  ...paperWrapStyle,
  overflowY: "visible",
  padding: 16,
};

const paperStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: 582,
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-xl)",
  boxShadow: "var(--sh-md)",
  padding: "34px 40px 42px",
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 20,
  background: "color-mix(in srgb, var(--bg) 55%, transparent)",
  backdropFilter: "blur(3px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 28,
};

const popStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: 452,
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-2xl)",
  boxShadow: "var(--sh-xl)",
  padding: "30px 30px 26px",
  textAlign: "center",
  overflow: "hidden",
};

function emptyStageStatus(): Record<StageName, StageStatus> {
  return {
    立意: "pending",
    行文: "pending",
    制版: "pending",
    自检: "pending",
    核验: "pending",
  };
}

function emptyStageDesc(): Record<StageName, string> {
  return {
    立意: "",
    行文: "",
    制版: "",
    自检: "",
    核验: "",
  };
}

function stageLine(status: StageStatus) {
  if (status === "done") return "var(--success)";
  if (status === "active") return "var(--orange-500)";
  return "var(--line-strong)";
}

export default function GeneratingTheater({ answers, onDone, onRetry, go, onConnect }: GeneratingTheaterProps) {
  const isMobile = useIsMobile();
  const createArticle = useArticlesStore((s) => s.createArticle);
  const updateArticle = useArticlesStore((s) => s.updateArticle);
  // H5:gate 判据放宽——内存密钥(本会话刚绑)OR 服务器已存密钥(configured
  // 列表含活跃号 appid)。持久化剥离 appsecret 不再让回访用户被降级。
  const { canPush: canPushDraft, account: activeAccount } = useWeChatPushable();
  const activeAccountName = activeAccount?.name || "当前公众号";

  const [stageStatus, setStageStatus] = useState<Record<StageName, StageStatus>>(emptyStageStatus);
  const [stageDesc, setStageDesc] = useState<Record<StageName, string>>(emptyStageDesc);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [statusText, setStatusText] = useState("正在立意...");
  const [sealed, setSealed] = useState(false);
  const [doneSlug, setDoneSlug] = useState<string | null>(null);
  const [error, setError] = useState<{ code: AgentErrorCode; message: string } | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);

  const handleRef = useRef<AgentStreamHandle | null>(null);
  const doneFiredRef = useRef(false);
  const titleRef = useRef("");

  const count = useMemo(() => title.length + body.length, [title, body]);
  const streaming = !sealed && !error && !transportError;
  const bodyParagraphs = body ? body.split("\n\n") : [];

  useEffect(() => {
    doneFiredRef.current = false;
    const reqBody = {
      intent: answers.intent,
      audience: answers.audience,
      tone: answers.tone,
      voice_sample: answers.voiceSample,
      use_brand_voice: answers.useBrandVoice,
    };

    const handle = agentStream("/api/v1/agent/write", reqBody, {
      onEvent: (ev: AgentEvent) => {
        switch (ev.type) {
          case "stage":
            setStageStatus((prev) => ({ ...prev, [ev.stage]: ev.status }));
            if (ev.desc) setStageDesc((prev) => ({ ...prev, [ev.stage]: ev.desc }));
            setStatusText(`正在${ev.stage}...`);
            break;
          case "title":
            titleRef.current = ev.text;
            setTitle(ev.text);
            break;
          case "token":
            setBody((prev) => prev + ev.text);
            break;
          case "done": {
            if (doneFiredRef.current) return;
            doneFiredRef.current = true;
            setSealed(true);
            setStageStatus({ 立意: "done", 行文: "done", 制版: "done", 自检: "done", 核验: "done" });
            setStatusText("制版完成 - 预览即所得,可继续发布");
            void (async () => {
              const draftTitle = titleRef.current.trim() || answers.intent.slice(0, 24) || "未命名推文";
              const created = await createArticle(draftTitle, "html");
              await updateArticle(created.id, {
                title: draftTitle,
                html: ev.html,
                markdown: ev.markdown,
              });
              // 批3:落一份 compose baseline 快照,作为后续三入口 agent 改动
              // (换调子/选中即改/chat)的初始检查点 —— 「回到本轮之前」可回到
              // 生成的原始版本。fire-and-forget(照 C2 ai_adopt 先例):快照失败
              // 不阻断生成成功流。P1 首存/冲突路径此时不落快照(已核对),不双写。
              void postRevision(created.id, ev.html, "compose").catch(() => {});
              setDoneSlug(buildArticleSlug(draftTitle, created.id));
              onDone();
            })();
            break;
          }
          case "error":
            setError({ code: ev.code, message: ev.message });
            break;
        }
      },
      onError: (message) => setTransportError(message),
    });
    handleRef.current = handle;
    return () => handle.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errMessage = error?.message ?? transportError;
  const isNoProvider = error?.code === "no_provider";

  return (
    <section className="gen-theater" style={rootStyle}>
      <div className="gen-top" style={topStyle}>
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 700, color: "var(--ink-strong)", fontSize: 15 }}>
          {streaming && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--orange-500)" }} />}
          {sealed ? "草稿已生成" : errMessage ? "生成未完成" : "生成中…"}
        </span>
        <span style={{ flex: 1 }} />
      </div>

      <div data-testid="gen-stage" style={isMobile ? stageMobileStyle : stageStyle}>
        <aside data-testid="gen-rail" style={isMobile ? railMobileStyle : railStyle}>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.14em", color: "var(--ink-faint)", textTransform: "uppercase" }}>
            工序 / 制版
          </span>
          <div
            style={{
              fontFamily: "var(--f-display)",
              fontSize: 23,
              fontWeight: 700,
              color: "var(--ink-strong)",
              margin: "9px 0 5px",
              lineHeight: 1.3,
              minHeight: 30,
            }}
            aria-live="polite"
          >
            {errMessage ? "生成中断" : sealed ? "校样通过,写好啦" : statusText}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 26, lineHeight: 1.5, minHeight: 20 }}>
            {errMessage ? "你的描述还在,可以直接重试" : sealed ? "排版好看 · 可直接贴进公众号" : "一个字一个字浮现出来"}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {STAGES.map(({ name, desc }, index) => {
              const status = stageStatus[name];
              const line = stageLine(status);
              return (
                <div
                  key={name}
                  className={`gen-step ${status}`}
                  data-testid={`stage-${name}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 1fr",
                    columnGap: 14,
                    position: "relative",
                    paddingBottom: index === STAGES.length - 1 ? 0 : 24,
                  }}
                >
                  {index !== STAGES.length - 1 && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: 15,
                        top: 34,
                        bottom: 2,
                        width: 2,
                        background: status === "done" ? "var(--success)" : "var(--line-strong)",
                        borderRadius: 1,
                      }}
                    />
                  )}
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      zIndex: 1,
                      background: status === "active" ? "var(--orange-500)" : status === "done" ? "var(--success-soft)" : "var(--surface)",
                      border: status === "active" ? "none" : `2px solid ${line}`,
                      color: status === "active" ? "var(--cream)" : status === "done" ? "var(--success)" : "var(--ink-faint)",
                    }}
                  >
                    {status === "done" ? <IconCheck size={17} /> : <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />}
                  </span>
                  <span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 15.5,
                        fontWeight: 700,
                        paddingTop: 4,
                        color: status === "pending" ? "var(--ink-faint)" : "var(--ink-strong)",
                      }}
                    >
                      {name}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12.5,
                        color: status === "active" ? "var(--orange-700)" : "var(--ink-soft)",
                        marginTop: 3,
                        lineHeight: 1.5,
                      }}
                    >
                      {stageDesc[name] || desc}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </aside>

        <div style={isMobile ? paperWrapMobileStyle : paperWrapStyle}>
          <article style={paperStyle} aria-live="polite" aria-atomic="false" aria-label="AI 正在逐字书写的草稿">
            {sealed && (
              <span
                style={{
                  position: "absolute",
                  top: 16,
                  right: 20,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--success)",
                  border: "2.5px solid var(--success)",
                  borderRadius: "var(--r-pill)",
                  padding: "5px 13px",
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: 1,
                  transform: "rotate(-7deg)",
                  background: "var(--success-soft)",
                }}
              >
                <IconCheck size={14} />
                校样通过
              </span>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 22,
                paddingBottom: 15,
                borderBottom: "1px dashed var(--line-strong)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
                <IconCopy size={14} />
                公众号草稿
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: sealed ? "var(--success-ink)" : "var(--orange-700)",
                  background: sealed ? "var(--success-soft)" : "var(--orange-50)",
                  padding: "5px 11px",
                  borderRadius: "var(--r-pill)",
                }}
              >
                {sealed ? <IconCheck size={13} /> : <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--orange-500)" }} />}
                {count} 字
              </span>
            </div>

            {title ? (
              <h1 style={{ fontFamily: "var(--f-display)", fontSize: 27, fontWeight: 700, lineHeight: 1.42, color: "var(--ink-strong)", margin: "0 0 18px" }}>
                {title}
              </h1>
            ) : (
              <h1 style={{ fontFamily: "var(--f-display)", color: "var(--ink-faint)", fontSize: 18, fontWeight: 400, fontStyle: "italic", margin: "0 0 18px" }}>
                标题会先出现在这里...
              </h1>
            )}

            <div style={{ fontFamily: "var(--f-display)", fontSize: 16.5, lineHeight: 2, color: "var(--ink)" }}>
              {bodyParagraphs.length ? (
                bodyParagraphs.map((p, index) => (
                  <p key={`${index}-${p.slice(0, 8)}`} style={{ margin: "0 0 15px" }}>
                    {p}
                    {streaming && index === bodyParagraphs.length - 1 && (
                      <span style={{ display: "inline-block", width: 2, height: "1.02em", background: "var(--orange-500)", marginLeft: 2, verticalAlign: "text-bottom" }} />
                    )}
                  </p>
                ))
              ) : (
                <div style={{ color: "var(--ink-faint)", fontSize: 15, fontStyle: "italic" }}>正文会一段一段地浮现出来...</div>
              )}
            </div>
          </article>
        </div>
      </div>

      {sealed && (
        <div style={overlayStyle}>
          <div style={popStyle} role="status" aria-live="polite" data-testid="compose-celebration" data-overlay="true">
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 15 }}>
              <CheckBurst size={64} />
            </div>
            <h2 style={{ fontFamily: "var(--f-display)", fontSize: 25, fontWeight: 700, color: "var(--ink-strong)", margin: "0 0 8px", lineHeight: 1.3 }}>
              写好了
            </h2>
            <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 auto 22px", maxWidth: 340 }}>
              预览就是粘贴效果。接下来可以先看效果,也可以直接进入复制或草稿箱流程。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!doneSlug}
                onClick={() => doneSlug && go("editor", { articleSlug: doneSlug })}
              >
                <IconEye size={17} />
                看看效果
              </button>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={!doneSlug}
                  onClick={() => doneSlug && go("editor", { articleSlug: doneSlug, intent: "publish" })}
                  style={{ flex: 1, minWidth: 150 }}
                >
                  <IconCopy size={17} />
                  复制到公众号
                </button>
                {canPushDraft && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={!doneSlug}
                    onClick={() => doneSlug && go("editor", { articleSlug: doneSlug, intent: "draft" })}
                    style={{ flex: 1, minWidth: 150 }}
                  >
                    <IconSend size={17} />
                    发到「{activeAccountName}」草稿箱
                  </button>
                )}
              </div>
            </div>
            <div style={{ marginTop: 16, fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.6, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <IconInfo size={14} />
              {canPushDraft ? "复制后,粘到公众号后台就能发;草稿箱适合排期。" : "想一键发草稿?先到设置里绑定公众号。现在复制到公众号就能继续。"}
            </div>
          </div>
        </div>
      )}

      {errMessage && (
        <div style={overlayStyle}>
          <div style={popStyle} role="alertdialog" aria-modal="true" aria-label="生成未完成">
            {isNoProvider ? (
              <>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 15 }}>
                  <span style={{ width: 60, height: 60, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--orange-50)", color: "var(--orange-500)" }}>
                    <IconSparkle size={30} />
                  </span>
                </div>
                <h2 style={{ fontFamily: "var(--f-display)", fontSize: 25, fontWeight: 700, color: "var(--ink-strong)", margin: "0 0 8px", lineHeight: 1.3 }}>
                  还差最后一步:连上 AI 才能帮你写
                </h2>
                <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 auto 22px", maxWidth: 340 }}>
                  写作用的是你自己的 AI 账号,内容不经我们服务器。连一次,以后就不用再连了。
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button type="button" className="btn btn-primary" onClick={() => (onConnect ? onConnect() : go("settings"))}>
                    <IconSparkle size={17} />
                    连接 AI 写手
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => go("settings", { section: "aiengine" })}>
                    我先去设置里配置
                  </button>
                </div>
                <div style={{ marginTop: 16, fontSize: 12, color: "var(--success-ink)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  <IconLock size={14} />
                  密钥只存你的本机 / 服务端,绝不上传任何第三方。
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 15 }}>
                  <span style={{ width: 60, height: 60, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--warning-soft)", color: "var(--warning-ink)" }}>
                    <IconWarn size={28} />
                  </span>
                </div>
                <h2 style={{ fontFamily: "var(--f-display)", fontSize: 25, fontWeight: 700, color: "var(--ink-strong)", margin: "0 0 8px", lineHeight: 1.3 }}>
                  差一点就写完了,再试一下?
                </h2>
                <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 auto 22px", maxWidth: 340 }}>
                  {errMessage}
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="btn btn-outline" onClick={onRetry} style={{ flex: 1 }}>
                    <IconRefresh size={17} />
                    换个说法 / 重试
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
