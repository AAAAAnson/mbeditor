import { useEffect, useMemo, useRef, useState } from "react";
import { htmlByteSize, splitHtmlIntoChunks, writeHtmlToClipboard } from "@/utils/clipboard";
import { IconCheck } from "@/components/icons";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Props {
  open: boolean;
  html: string | null;
  hint?: string;
  onClose: () => void;
  onSendToDraft?: () => void;
  canSendToDraft?: boolean;
  // 复制成功后标注「图片已上传到哪个公众号素材库」,让用户确认贴对了号。
  // 为空(未绑公众号)时不标注账号、只提示图片未上传。
  accountName?: string;
  // 后端不可用(healthStore.status==="down")。复制失败时用来把锅归因到
  // 「后端连不上」而非用户操作,避免误导用户反复点复制。
  backendDown?: boolean;
}

// Above this size we auto-offer the chunked-copy flow. Below it, the
// single-click path still works fine on every browser we've tested.
// Chrome's CF_HTML write on Windows starts truncating around ~1 MB, and
// WeChat's UEditor onpaste handler falls back to text/plain on a "too large"
// heuristic somewhere south of that — both failures look like "all formatting
// was stripped" to the user.
const CHUNK_THRESHOLD_BYTES = 400 * 1024;
const CHUNK_TARGET_BYTES = 250 * 1024;

type Mode = "choose" | "chunks";

// Rich-text copy works in BOTH secure and non-secure contexts: writeHtmlToClipboard
// uses navigator.clipboard.write when available (secure: https/localhost) and
// transparently falls back to document.execCommand("copy") over a rich selection
// otherwise — and execCommand("copy") IS allowed on plain-http LAN origins (verified
// on the production NAS instance: navigator.clipboard absent, execCommand returns
// true, formatting survives the 公众号 paste). So we always offer the copy button;
// do NOT gate it on navigator.clipboard presence. (A prior version hid copy on
// non-secure origins and steered to 草稿箱/下载 — that was wrong: it broke the
// working execCommand path that http users relied on.) 草稿箱 remains an alternative
// for users who prefer the API or have a 公众号 bound; download was removed (公众号
// 后台 has no "import HTML", so a .html file is a dead end).

// Copying rich HTML to the clipboard requires a *fresh* user activation — the
// browser expires the one from the original 复制富文本 button by the time the
// backend round-trip finishes. navigator.clipboard.write is also blocked in
// non-secure plain-http LAN contexts. Both paths need the user to
// click a second time. This dialog makes that explicit: server-processed HTML
// is ready → one extra click → clipboard. For oversized articles it splits
// the HTML and walks the user through one paste per chunk.
export default function CopyReadyDialog({
  open,
  html,
  hint,
  onClose,
  onSendToDraft,
  canSendToDraft = false,
  accountName,
  backendDown = false,
}: Props) {
  const sizeBytes = useMemo(() => (html ? htmlByteSize(html) : 0), [html]);
  const isLong = sizeBytes > CHUNK_THRESHOLD_BYTES;
  const chunks = useMemo(() => {
    if (!html || !isLong) return [];
    return splitHtmlIntoChunks(html, CHUNK_TARGET_BYTES);
  }, [html, isLong]);

  const [mode, setMode] = useState<Mode>("choose");
  const [chunkIndex, setChunkIndex] = useState(0);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [message, setMessage] = useState<string>("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, open, onClose);

  useEffect(() => {
    if (!open) {
      setMode("choose");
      setChunkIndex(0);
      setStatus("idle");
      setMessage("");
    }
  }, [open]);

  if (!open || !html) return null;

  const trySingleCopy = async () => {
    try {
      await writeHtmlToClipboard(html);
      setStatus("ok");
      // 复制成功改为「可停留确认」(替旧的 0.9s 一闪自动关):SingleCopyView 在 status==='ok'
      // 时渲染结构化成功面板(标注号名 + 下一步去后台粘贴引导 + 完成按钮),用户主动关。
      setMessage("已复制到剪贴板");
    } catch (err) {
      setStatus("err");
      // 后端不可用时把锅归因到「服务连不上」,而非让用户以为是自己操作问题。
      const prefix = backendDown
        ? "后端服务连不上，复制处理可能未完成"
        : err instanceof Error && err.message
          ? err.message
          : "复制失败";
      setMessage(`${prefix}。请在下方文本框里手动全选复制。`);
    }
  };

  const tryChunkCopy = async () => {
    const chunk = chunks[chunkIndex];
    if (!chunk) return;
    try {
      await writeHtmlToClipboard(chunk);
      setStatus("ok");
      const isLast = chunkIndex === chunks.length - 1;
      setMessage(isLast ? "最后一段已复制，去后台粘贴即可完成" : `第 ${chunkIndex + 1} 段已复制，去后台粘贴完后回来`);
      if (!isLast) {
        // Advance for the next click. Reset status so the button label flips
        // to "复制第 X 段" instead of staying on the success label.
        window.setTimeout(() => {
          setChunkIndex((i) => i + 1);
          setStatus("idle");
          setMessage("");
        }, 600);
      }
    } catch (err) {
      setStatus("err");
      setMessage(
        err instanceof Error && err.message
          ? `${err.message}。请在下方文本框里手动全选复制本段。`
          : "复制失败。请在下方文本框里手动全选复制本段。",
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-ready-title"
      data-testid="copy-ready-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 1100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--surface)",
          color: "var(--ink)",
          width: "min(520px, 100%)",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--line)",
          borderLeft: "4px solid var(--orange-500)",
          padding: "20px 22px 18px",
          boxShadow: "var(--shadow-lg)",
          outline: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isLong && (
          <SingleCopyView
            html={html}
            hint={hint}
            status={status}
            message={message}
            accountName={accountName}
            onCopy={trySingleCopy}
            onClose={onClose}
          />
        )}

        {isLong && mode === "choose" && (
          <ChooseView
            sizeBytes={sizeBytes}
            chunkCount={chunks.length}
            canSendToDraft={canSendToDraft}
            onPickChunks={() => {
              setMode("chunks");
              setStatus("idle");
              setMessage("");
            }}
            onPickDraft={() => {
              if (onSendToDraft) onSendToDraft();
            }}
            onClose={onClose}
          />
        )}

        {isLong && mode === "chunks" && (
          <ChunkedView
            chunks={chunks}
            chunkIndex={chunkIndex}
            status={status}
            message={message}
            onCopy={tryChunkCopy}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

function formatKB(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function SingleCopyView({
  html,
  hint,
  status,
  message,
  accountName,
  onCopy,
  onClose,
}: {
  html: string;
  hint?: string;
  status: "idle" | "ok" | "err";
  message: string;
  accountName?: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  // Copy works in every context (new API or execCommand fallback), so always
  // offer it. The manual source textarea only appears as a last-ditch aid if a
  // copy attempt actually throws.
  const showFallback = status === "err";

  // 复制成功 → 可停留确认面板(替旧的 0.9s 一闪自动关):明确「复制到哪个号 + 下一步去
  // 后台粘贴」,用户主动点「完成」才关。与分段复制最后一段的「全部完成」停留态对齐。
  if (status === "ok") {
    return (
      <div data-testid="copy-success-confirm">
        <div
          id="copy-ready-title"
          style={{
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "var(--f-display)",
            letterSpacing: "0.02em",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--forest)",
          }}
        >
          <IconCheck size={16} /> 已复制到剪贴板
        </div>
        {accountName && (
          <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.7, marginBottom: 10 }}>
            当前公众号「{accountName}」,图片素材已就位。
          </div>
        )}
        <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.7, marginBottom: 6 }}>
          下一步:
        </div>
        <ol style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.7, margin: "0 0 16px 18px", padding: 0 }}>
          <li>打开公众号后台,新建或编辑图文</li>
          <li>把光标放进正文,Ctrl+V 粘贴</li>
          <li>检查排版无误后保存草稿</li>
        </ol>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={onClose} autoFocus>
            完成
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        id="copy-ready-title"
        style={{
          fontSize: 15,
          fontWeight: 600,
          fontFamily: "var(--f-display)",
          letterSpacing: "0.02em",
          marginBottom: 10,
        }}
      >
        正文已准备好
      </div>
      <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.7, marginBottom: 14 }}>
        {hint ?? "浏览器要求剪贴板写入发生在最新一次点击里，请再点一下按钮完成复制。"}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={onCopy} autoFocus>
          点此复制到剪贴板
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          取消
        </button>
        {status === "err" && <span style={{ fontSize: 12, color: "var(--danger)" }}>{message}</span>}
      </div>

      {showFallback && (
        <textarea
          data-testid="copy-ready-fallback-textarea"
          readOnly
          value={html}
          onFocus={(e) => e.currentTarget.select()}
          style={fallbackTextareaStyle}
        />
      )}
    </>
  );
}

function ChooseView({
  sizeBytes,
  chunkCount,
  canSendToDraft,
  onPickChunks,
  onPickDraft,
  onClose,
}: {
  sizeBytes: number;
  chunkCount: number;
  canSendToDraft: boolean;
  onPickChunks: () => void;
  onPickDraft: () => void;
  onClose: () => void;
}) {
  const cantSplit = chunkCount <= 1;

  return (
    <>
      <div
        id="copy-ready-title"
        style={{
          fontSize: 15,
          fontWeight: 600,
          fontFamily: "var(--f-display)",
          letterSpacing: "0.02em",
          marginBottom: 10,
        }}
      >
        内容较大（约 {formatKB(sizeBytes)}）
      </div>
      <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.7, marginBottom: 16 }}>
        {cantSplit
          ? "这篇文章是一整块，没法自动分段。请改用草稿箱直接发到公众号后台。"
          : "内容太大，一次性粘贴到公众号大概率会丢格式。请选一种粘贴方式："}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {!cantSplit && (
          <button className="btn btn-primary btn-sm" onClick={onPickChunks} autoFocus>
            分段复制（共 {chunkCount} 段）
          </button>
        )}
        <button
          className={cantSplit ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
          onClick={onPickDraft}
          disabled={!canSendToDraft}
          title={canSendToDraft ? "" : "需先在设置里授权公众号并选为当前账号"}
          autoFocus={cantSplit}
        >
          {cantSplit ? "发到草稿箱" : "改用草稿箱发送"}
          {canSendToDraft ? "" : "（未绑定公众号）"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          取消
        </button>
      </div>

      {!cantSplit && (
        <div style={{ fontSize: 11, color: "var(--fg-4)", lineHeight: 1.6 }}>
          分段复制：把文章按内容块切成 {chunkCount} 段，逐段粘到后台编辑器末尾。
          <br />
          草稿箱：跳过复制粘贴，直接发到公众号后台草稿（图片会自动重传，文中外链图片可能丢失）。
        </div>
      )}
    </>
  );
}

function ChunkedView({
  chunks,
  chunkIndex,
  status,
  message,
  onCopy,
  onClose,
}: {
  chunks: string[];
  chunkIndex: number;
  status: "idle" | "ok" | "err";
  message: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  const total = chunks.length;
  const human = chunkIndex + 1;
  const isLast = chunkIndex === total - 1;
  const justCopiedLast = isLast && status === "ok";
  // 分段复制只在安全上下文可达(非安全上下文 ChooseView 已隐藏「分段复制」、改引导
  // 草稿箱),故这里只需在某段复制失败时给手动全选复制的最后兜底。
  const showFallback = status === "err";
  // An <svg> too large to split is kept whole and may blow past the per-paste
  // budget. Warn the user up front so a truncated/rejected paste isn't silent
  // (review F10).
  const currentOversized =
    new Blob([chunks[chunkIndex] ?? ""]).size > CHUNK_TARGET_BYTES;

  return (
    <>
      <div
        id="copy-ready-title"
        style={{
          fontSize: 15,
          fontWeight: 600,
          fontFamily: "var(--f-display)",
          letterSpacing: "0.02em",
          marginBottom: 10,
        }}
      >
        分段复制 · 第 {human} / {total} 段
      </div>

      <ol style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.7, margin: "0 0 14px 18px", padding: 0 }}>
        <li>点下方按钮复制本段</li>
        <li>
          切到公众号后台，把光标放在编辑器<b>末尾</b>，Ctrl+V 粘贴
        </li>
        <li>回到这里点"复制下一段"，重复到全部完成</li>
      </ol>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {!justCopiedLast && (
          <button className="btn btn-primary btn-sm" onClick={onCopy} autoFocus>
            复制第 {human} 段到剪贴板（约 {formatKB(new Blob([chunks[chunkIndex] ?? ""]).size)}）
          </button>
        )}
        {justCopiedLast && (
          <button className="btn btn-primary btn-sm" onClick={onClose} autoFocus>
            全部完成
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          {justCopiedLast ? "关闭" : "取消"}
        </button>
        {status === "ok" && <span style={{ fontSize: 12, color: "var(--accent)" }}>{message}</span>}
        {status === "err" && <span style={{ fontSize: 12, color: "var(--danger)" }}>{message}</span>}
      </div>

      {currentOversized && (
        <div
          data-testid="copy-chunk-oversize-warning"
          style={{ fontSize: 12, color: "var(--danger)", lineHeight: 1.6, marginBottom: 8 }}
        >
          本段含一个无法再拆分的大块（通常是大型 SVG，约 {formatKB(new Blob([chunks[chunkIndex] ?? ""]).size)}），
          超过单次粘贴的安全体积，微信粘贴时可能被截断或丢弃。若粘贴后该图未出现，请改用草稿箱发送。
        </div>
      )}

      <ChunkDots total={total} index={chunkIndex} done={status === "ok"} />

      {showFallback && (
        <textarea
          data-testid="copy-ready-fallback-textarea"
          readOnly
          value={chunks[chunkIndex] ?? ""}
          onFocus={(e) => e.currentTarget.select()}
          style={fallbackTextareaStyle}
        />
      )}
    </>
  );
}

function ChunkDots({ total, index, done }: { total: number; index: number; done: boolean }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 4, marginBottom: 4 }}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i < index || (i === index && done);
        return (
          <span
            key={i}
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              background: filled ? "var(--accent)" : "var(--border)",
              opacity: i === index && !done ? 0.8 : 1,
            }}
          />
        );
      })}
    </div>
  );
}

const fallbackTextareaStyle: React.CSSProperties = {
  width: "100%",
  height: 140,
  fontFamily: "var(--f-mono)",
  fontSize: 11,
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: 8,
  background: "var(--surface)",
  color: "var(--fg-2)",
  resize: "vertical",
  boxSizing: "border-box",
  marginTop: 8,
};
