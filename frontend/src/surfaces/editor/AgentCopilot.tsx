import { useState, useEffect, useRef } from "react";
import { IconAgent, IconClose, IconSend } from "@/components/icons";
import Chip from "@/components/shared/Chip";
import Pulse from "@/components/shared/Pulse";
import api from "@/lib/api";
import { useWeChatStore } from "@/stores/wechatStore";
import { useArticlesStore } from "@/stores/articlesStore";
import { toast } from "@/stores/toastStore";
import type { AgentMessage, ArticleFull } from "@/types";

// ── Named export: standalone publish-capable component used by tests ──
export function AgentCopilot() {
  const [publishing, setPublishing] = useState(false);

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

  return (
    <button
      className="btn btn-primary btn-sm"
      onClick={handlePublish}
      disabled={publishing}
    >
      推送到草稿
    </button>
  );
}

const MOCK_AGENT_STREAM: AgentMessage[] = [
  { t: "17:02:14", kind: "user", text: "把第三段卡片改成带图的样式，图用刚上传的 warm 01" },
  { t: "17:02:15", kind: "think", text: "已识别第三段卡片，准备改成带图样式" },
  { t: "17:02:16", kind: "tool", method: "GET", path: "/api/v1/articles/MB-2604-018" },
  { t: "17:02:17", kind: "tool", method: "PUT", path: "/api/v1/articles/MB-2604-018" },
  { t: "17:02:18", kind: "diff", add: 6, remove: 2, hint: "Card b4 + img" },
  { t: "17:02:19", kind: "assistant", text: "第三段已经改成带图样式了。要不要顺手同步到其他卡片？" },
  { t: "17:04:03", kind: "user", text: "预览一下微信兼容样式" },
  { t: "17:04:04", kind: "tool", method: "POST", path: "/api/v1/publish/preview" },
  { t: "17:04:05", kind: "assistant", text: "已经按公众号兼容规则处理好了，可以继续预览或发到草稿箱。" },
];

const SUGGESTED_ACTIONS = ["生成封面", "润色开头", "插入对比表", "发到草稿箱"];

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
  const [stream, setStream] = useState<AgentMessage[]>(MOCK_AGENT_STREAM);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [stream]);

  const send = () => {
    if (!input.trim()) return;
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const newItems: AgentMessage[] = [
      { t, kind: "user", text: input },
      { t, kind: "think", text: "正在整理需求，准备开始处理" },
      { t, kind: "tool", method: "POST", path: "/api/v1/publish/process" },
      { t, kind: "assistant", text: "已经处理好了，可以直接在预览里查看效果。" },
    ];
    setStream((prev) => [...prev, ...newItems]);
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
          <Chip tone="forest">
            <Pulse size={6} />
            在线
          </Chip>
          <Chip tone="gold">已连接</Chip>
          <Chip>3 次调用</Chip>
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
