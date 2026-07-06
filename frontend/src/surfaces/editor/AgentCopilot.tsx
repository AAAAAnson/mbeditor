import { useState, useEffect, useRef } from "react";
import { IconAgent, IconClose, IconSend } from "@/components/icons";
import Pulse from "@/components/shared/Pulse";
import { Tag } from "@/components/ui";
import api from "@/lib/api";
import { useWeChatStore } from "@/stores/wechatStore";
import { useArticlesStore } from "@/stores/articlesStore";
import { toast } from "@/stores/toastStore";
import type { AgentMessage, ArticleFull } from "@/types";

// Backend shape for POST /agent/generate-svg (see
// backend/app/services/agent_svg_prompt.py). Status lives in the body —
// HTTP is always 200 so axios never throws for "failed" generations.
interface SvgGenerateReport {
  issues: Array<{ line: number; rule: string; message: string; suggestion: string }>;
  warnings: Array<{ line: number; rule: string; message: string; suggestion: string }>;
  stats: Record<string, number>;
}
interface SvgGenerateResult {
  status: "ok" | "failed";
  html: string;
  warnings: Array<{ kind: string; message?: string; rule?: string }>;
  report: SvgGenerateReport;
  attempts: number;
}

// ── Named export: standalone publish-capable component used by tests ──
export function AgentCopilot() {
  const [publishing, setPublishing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [svgPromptOpen, setSvgPromptOpen] = useState(false);
  const [svgPrompt, setSvgPrompt] = useState("");
  const [svgError, setSvgError] = useState<SvgGenerateReport | null>(null);

  const handlePublish = async () => {
    const active = useWeChatStore.getState().getActiveAccount();
    if (!active) {
      toast.error("请先在设置中添加并选择公众号");
      return;
    }
    const currentId = useArticlesStore.getState().currentArticleId;
    const article = useArticlesStore.getState().articles.find((a) => a.id === currentId) as ArticleFull | undefined;
    if (!article) {
      toast.error("没有选中的文章");
      return;
    }
    setPublishing(true);
    try {
      await api.post("/wechat/draft", {
        appid: active.appid,
        appsecret: active.appsecret,
        article: {
          title: article.title,
          html: article.html ?? "",
          css: article.css ?? "",
          author: article.author ?? "",
          digest: article.digest ?? "",
          cover: article.cover ?? "",
          mode: article.mode,
          markdown: article.markdown ?? "",
        },
      });
      toast.success("已发送到微信草稿箱");
    } catch {
      toast.error("发布失败");
    } finally {
      setPublishing(false);
    }
  };

  const handleGenerateSvg = async () => {
    const prompt = svgPrompt.trim();
    if (!prompt) {
      toast.error("请先描述你想要的交互");
      return;
    }
    const currentId = useArticlesStore.getState().currentArticleId;
    const article = useArticlesStore.getState().articles.find((a) => a.id === currentId) as
      | ArticleFull
      | undefined;
    if (!article) {
      toast.error("没有选中的文章");
      return;
    }
    setGenerating(true);
    setSvgError(null);
    try {
      const resp = await api.post("/agent/generate-svg", { prompt });
      const payload = resp.data as { code: number; data: SvgGenerateResult };
      const result = payload.data;
      if (result.status === "ok" && result.html) {
        // No cursor API available on ArticleFull — append to article.html.
        const nextHtml = (article.html ?? "") + "\n" + result.html;
        await useArticlesStore.getState().updateArticle(article.id, { html: nextHtml });
        toast.success("已插入交互积木");
        setSvgPromptOpen(false);
        setSvgPrompt("");
      } else {
        setSvgError(result.report);
        toast.error("生成失败，请查看报告");
      }
    } catch {
      toast.error("生成接口调用失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <button
        className="btn btn-primary btn-sm"
        onClick={handlePublish}
        disabled={publishing}
      >
        推送到草稿
      </button>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => setSvgPromptOpen(true)}
        disabled={generating}
        style={{ marginLeft: 8 }}
      >
        生成交互 SVG 积木
      </button>

      {svgPromptOpen && (
        <div
          role="dialog"
          aria-label="生成交互 SVG 积木"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--surface, #fff)",
              padding: 20,
              borderRadius: 12,
              minWidth: 420,
              maxWidth: 560,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
              生成交互 SVG 积木
            </div>
            <input
              autoFocus
              value={svgPrompt}
              onChange={(e) => setSvgPrompt(e.target.value)}
              placeholder="你想做什么样的交互？（如：10 题年终共鸣投票 / 产品剖面图热点展开 / FAQ 手风琴）"
              aria-label="interaction prompt"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border-2, #ddd)",
                borderRadius: 8,
                fontSize: 13,
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGenerateSvg();
                if (e.key === "Escape") setSvgPromptOpen(false);
              }}
            />
            {svgError && svgError.issues.length > 0 && (
              <div
                role="alert"
                style={{
                  marginTop: 12,
                  padding: 10,
                  background: "var(--surface-2, #fff4f4)",
                  border: "1px solid var(--warn, #e55)",
                  borderRadius: 8,
                  fontSize: 12,
                  maxHeight: 200,
                  overflow: "auto",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>校验未通过（{svgError.issues.length} 处）</div>
                {svgError.issues.map((iss, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    [行 {iss.line}] {iss.rule}: {iss.message}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSvgPromptOpen(false)}
                disabled={generating}
              >
                取消
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleGenerateSvg}
                disabled={generating}
              >
                {generating ? "生成中…" : "生成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const SUGGESTED_ACTIONS = ["生成封面", "润色开头", "插入对比表", "生成交互 SVG 积木", "发到草稿箱"];

// ── Stream item renderer ──
function AgentStreamItem({ e }: { e: AgentMessage }) {
  if (e.kind === "user") {
    return (
      <div className="slide-up" style={{ marginBottom: 12 }}>
        <div
          className="mono"
          style={{ fontSize: 9, color: "var(--fg-5)", letterSpacing: "0.1em", marginBottom: 4 }}
        >
          你 &middot; {e.t}
        </div>
        <div
          style={{
            padding: "8px 12px",
            background: "var(--surface-2)",
            borderRadius: 8,
            borderLeft: "2px solid var(--fg-4)",
            fontSize: 13,
            color: "var(--fg-2)",
            lineHeight: 1.6,
          }}
        >
          {e.text}
        </div>
      </div>
    );
  }

  if (e.kind === "assistant") {
    return (
      <div className="slide-up" style={{ marginBottom: 12 }}>
        <div
          className="mono"
          style={{ fontSize: 9, color: "var(--gold)", letterSpacing: "0.1em", marginBottom: 4 }}
        >
          助手 &middot; {e.t}
        </div>
        <div
          style={{
            padding: "8px 12px",
            background: "var(--gold-soft)",
            borderRadius: 8,
            borderLeft: "2px solid var(--gold)",
            fontSize: 13,
            color: "var(--fg)",
            lineHeight: 1.6,
            fontFamily: "var(--f-sans)",
          }}
        >
          {e.text}
        </div>
      </div>
    );
  }

  if (e.kind === "think") {
    return (
      <div
        className="slide-up"
        style={{
          marginBottom: 8,
          display: "flex",
          gap: 8,
          alignItems: "center",
          color: "var(--fg-4)",
          fontSize: 11,
          fontFamily: "var(--f-mono)",
        }}
      >
        <span style={{ opacity: 0.5 }}>&loz;</span>
        <span style={{ fontStyle: "italic" }}>{e.text}</span>
      </div>
    );
  }

  if (e.kind === "tool") {
    const methodColor =
      e.method === "POST"
        ? "var(--accent)"
        : e.method === "PUT"
          ? "var(--warn)"
          : "var(--info)";
    return (
      <div
        className="slide-up"
        style={{
          marginBottom: 8,
          padding: "5px 8px",
          background: "var(--surface)",
          borderRadius: 4,
          fontFamily: "var(--f-mono)",
          fontSize: 10.5,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: methodColor, fontWeight: 600 }}>{e.method}</span>
        <span style={{ color: "var(--fg-2)" }}>{e.path}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--forest)" }}>200</span>
      </div>
    );
  }

  if (e.kind === "diff") {
    return (
      <div
        className="slide-up"
        style={{
          marginBottom: 10,
          padding: "8px 10px",
          border: "1px solid var(--border-2)",
          borderRadius: 6,
          background: "var(--surface)",
        }}
      >
        <div className="mono" style={{ fontSize: 10, color: "var(--fg-4)", marginBottom: 4 }}>
          改动 &middot; {e.hint}
        </div>
        <div style={{ display: "flex", gap: 10, fontFamily: "var(--f-mono)", fontSize: 10.5 }}>
          <span style={{ color: "var(--forest)" }}>+{e.add}</span>
          <span style={{ color: "var(--accent)" }}>&minus;{e.remove}</span>
          <span style={{ flex: 1, display: "flex", gap: 2 }}>
            {[...Array(e.add || 0)].map((_, i) => (
              <span
                key={`a${i}`}
                style={{ flex: 1, height: 3, background: "var(--forest)", opacity: 0.7 }}
              />
            ))}
            {[...Array(e.remove || 0)].map((_, i) => (
              <span
                key={`r${i}`}
                style={{ flex: 1, height: 3, background: "var(--accent)", opacity: 0.6 }}
              />
            ))}
          </span>
        </div>
      </div>
    );
  }

  return null;
}

// ── AgentCopilot ──
interface AgentCopilotProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

function AgentCopilotPanel({ open, setOpen }: AgentCopilotProps) {
  const [input, setInput] = useState("");
  const [stream, setStream] = useState<AgentMessage[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [stream]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    // 旁路保壳:不再 fabricate think/tool/assistant 假流。真流式走 ComposeSurface + agentStream。
    setStream((prev) => [...prev, { t, kind: "user", text }]);
    setInput("");
  };

  // Collapsed state
  if (!open) {
    return (
      <div
        style={{
          borderLeft: "1px solid var(--border)",
          background: "var(--bg-deep)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "12px 0",
        }}
      >
        <button
          className="rail-btn active"
          onClick={() => setOpen(true)}
          title="打开助手"
          style={{
            all: "unset",
            width: 34,
            height: 34,
            display: "grid",
            placeItems: "center",
            borderRadius: "var(--r-sm)",
            color: "var(--fg)",
            background: "var(--surface-2)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <IconAgent size={16} />
        </button>
        <div
          style={{
            marginTop: 18,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontFamily: "var(--f-mono)",
            fontSize: 9,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "var(--fg-5)",
          }}
        >
          助手
        </div>
      </div>
    );
  }

  // Expanded state
  const toolCallCount = stream.filter((e) => e.kind === "tool").length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-deep)",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--gold-soft)",
              border: "1px solid var(--gold-border)",
              display: "grid",
              placeItems: "center",
              color: "var(--gold)",
            }}
          >
            <IconAgent size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 16,
                color: "var(--fg)",
                fontFamily: "var(--f-display)",
              }}
            >
              助手
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--fg-4)" }}>
              claude-sonnet-4.5 &middot; mbeditor.skill
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="btn btn-ghost btn-sm"
            style={{ padding: 4 }}
          >
            <IconClose size={12} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Tag tone="success" leading={<Pulse size={6} />}>在线</Tag>
          <Tag tone="warning">已连接</Tag>
          <Tag>3 次调用</Tag>
        </div>
      </div>

      {/* Stream */}
      <div
        ref={scrollerRef}
        style={{ flex: 1, overflow: "auto", padding: "14px 18px", minHeight: 0 }}
      >
        <div className="caps" style={{ marginBottom: 10 }}>
          最近操作
        </div>
        {stream.map((e, i) => (
          <AgentStreamItem key={i} e={e} />
        ))}
      </div>

      {/* Suggested actions */}
      <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border)" }}>
        <div className="caps" style={{ marginBottom: 8 }}>
          快捷操作
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SUGGESTED_ACTIONS.map((t) => (
            <button key={t} className="btn btn-outline btn-sm" style={{ fontSize: 11 }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--border)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "6px 6px 6px 14px",
            border: "1px solid var(--border-2)",
            borderRadius: 10,
            background: "var(--surface)",
          }}
        >
          <span
            className="mono"
            style={{ color: "var(--accent)", fontSize: 12, marginRight: 8 }}
          >
            &rarr;
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="告诉助手你想改什么…"
            style={{
              all: "unset",
              flex: 1,
              fontSize: 13,
              color: "var(--fg)",
              fontFamily: "var(--f-sans)",
            }}
          />
          <button
            onClick={send}
            className="btn btn-primary btn-sm"
            style={{ padding: "6px 10px" }}
          >
            <IconSend size={12} />
          </button>
        </div>
        <div
          className="mono"
          style={{
            marginTop: 8,
            fontSize: 10,
            color: "var(--fg-5)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{"⌘↵ 发送 · Esc 撤销上一步"}</span>
          <span>{toolCallCount} 次调用</span>
        </div>
      </div>
    </div>
  );
}

export default AgentCopilotPanel;
