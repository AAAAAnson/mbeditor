import { useState } from "react";
import { Copy, Download, Send } from "lucide-react";
import {
  getErrorMessage,
  type CopyArticleResult,
  type PublishArticleResult,
} from "@/features/editor/services/DocumentActionService";

interface ActionPanelProps {
  onCopy: () => Promise<CopyArticleResult>;
  onPublish: () => Promise<PublishArticleResult>;
  onExport: () => Promise<void>;
}

export default function ActionPanel({
  onCopy,
  onPublish,
  onExport,
}: ActionPanelProps) {
  const [copyMsg, setCopyMsg] = useState("");
  const [copyMsgKind, setCopyMsgKind] = useState<"success" | "warn" | "error">(
    "success",
  );
  const [publishMsg, setPublishMsg] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyStage, setCopyStage] = useState<"upload" | "fallback">("upload");

  const showCopyMsg = (msg: string, kind: "success" | "warn" | "error") => {
    setCopyMsg(msg);
    setCopyMsgKind(kind);
    setTimeout(() => setCopyMsg(""), 4000);
  };

  const handleCopy = async () => {
    setCopying(true);
    setCopyStage("upload");
    setCopyMsg("");
    try {
      const result = await onCopy();
      setCopyStage(result.stage);
      showCopyMsg(result.message, result.kind);
    } finally {
      setCopying(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishMsg("");
    try {
      const result = await onPublish();
      setPublishMsg(result.message);
    } catch (error: unknown) {
      setPublishMsg(getErrorMessage(error, "推送失败。"));
    } finally {
      setPublishing(false);
      setTimeout(() => setPublishMsg(""), 3000);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <button
        onClick={handleCopy}
        disabled={copying}
        className="w-full cursor-pointer rounded-lg bg-accent px-3 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        <span className="flex items-center gap-2">
          <Copy size={14} />
          {copying
            ? copyStage === "upload"
              ? "正在上传图片到微信 CDN..."
              : "正在回退为本地复制..."
            : "一键复制富文本"}
        </span>
      </button>
      {copyMsg && (
        <div
          className={[
            "px-1 text-[11px]",
            copyMsgKind === "success"
              ? "text-success"
              : copyMsgKind === "warn"
                ? "text-warning"
                : "text-error",
          ].join(" ")}
        >
          {copyMsg}
        </div>
      )}

      <button
        onClick={handlePublish}
        disabled={publishing}
        className="w-full cursor-pointer rounded-lg bg-surface-tertiary px-3 py-2.5 text-[13px] font-medium text-fg-primary transition-colors hover:bg-border-primary disabled:opacity-50"
      >
        <span className="flex items-center gap-2">
          <Send size={14} />
          {publishing ? "正在推送..." : "推送到草稿箱"}
        </span>
      </button>
      {publishMsg && (
        <div className="px-1 text-[11px] text-fg-secondary">{publishMsg}</div>
      )}

      <button
        onClick={onExport}
        className="w-full cursor-pointer rounded-lg bg-surface-tertiary px-3 py-2.5 text-[13px] font-medium text-fg-primary transition-colors hover:bg-border-primary"
      >
        <span className="flex items-center gap-2">
          <Download size={14} />
          导出 HTML
        </span>
      </button>
    </div>
  );
}
