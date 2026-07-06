// frontend/src/lib/chatStream.ts
// /agent/chat 的 SSE 客户端。解析惯例照 agentStream.ts(fetch + ReadableStream、
// 逐 \n\n 切帧、跨 chunk 残帧缓冲),但有两处刻意不同:
//
// 1. **绝不自动重连**:chat turn 是有状态的(工具已在服务端执行、快照已落盘),
//    重放 POST 会重复执行工具 + 重复落 checkpoint;失败一律交给用户显式重试。
// 2. **运行时 guard**:每帧过 isChatEvent 逐 kind 校验,非法帧丢弃并计数
//    (handle.droppedFrames()),绝不 `as` 裸断言进状态机。
//
// 传输层错误(网络/HTTP 状态码)复用 api.friendlyErrorMessage 的中文映射。
import { friendlyErrorMessage } from "@/lib/api";
import { isChatEvent, type ChatEvent } from "@/types/agentChat";

/** 发给后端的对话历史消息(与 AgentChatReq.messages 对齐)。 */
export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatStreamOptions {
  articleId: string;
  /** 当前整篇 HTML(会话真源,后端据此切块)。 */
  html: string;
  /** 对话历史(含本轮新 user 消息)。 */
  messages: ChatHistoryMessage[];
  /** 可选外部中止信号(与 handle.abort() 等效)。 */
  signal?: AbortSignal;
  onEvent: (event: ChatEvent) => void;
  /** 仅传输层失败(网络/HTTP/无终态断流),message 已是中文。 */
  onError: (message: string) => void;
  /** 收到终态帧(turn_done/error)后正常收尾。 */
  onClose?: () => void;
}

export interface ChatStreamHandle {
  abort: () => void;
  /** 本次流累计丢弃的非法帧数(运行时 guard 拦截,含坏 JSON)。 */
  droppedFrames: () => number;
}

/**
 * POST /api/v1/agent/chat 开一个 turn 的 SSE 流。
 * 终态帧 = turn_done / error(含 validate_failed code);收到即停读、onClose。
 */
export function streamChatTurn(opts: ChatStreamOptions): ChatStreamHandle {
  const controller = new AbortController();
  let aborted = false;
  let terminal = false; // 收到 turn_done/error 业务终态后置真
  let buffer = ""; // 跨 chunk 残帧缓冲
  let dropped = 0;

  if (opts.signal) {
    const external = opts.signal;
    const cancel = () => {
      aborted = true;
      terminal = true;
      controller.abort();
    };
    if (external.aborted) cancel();
    else external.addEventListener("abort", cancel, { once: true });
  }

  const dispatchFrame = (raw: string): void => {
    // raw 是一条以空行分隔的 SSE 记录;只取 data: 行拼起来。
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (dataLines.length === 0) return; // 注释/心跳行
    const payload = dataLines.join("\n");
    if (payload === "[DONE]") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      dropped += 1; // 完整记录仍是坏 JSON(半帧已被 buffer 兜住)→ 计数丢弃
      return;
    }
    if (!isChatEvent(parsed)) {
      dropped += 1; // 未知 kind / 缺必备字段:丢弃,不进状态机
      return;
    }
    if (parsed.type === "turn_done" || parsed.type === "error") {
      terminal = true;
    }
    opts.onEvent(parsed);
  };

  const drainBuffer = (): void => {
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const record = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (record.length > 0) dispatchFrame(record);
      // 终态帧(turn_done/error)后同 chunk 的残余帧一律截断丢弃:
      // 终态之后的一切都是噪声(代理粘包/后端多吐),不进状态机。
      if (terminal) {
        buffer = "";
        return;
      }
    }
  };

  const run = async (): Promise<void> => {
    try {
      const resp = await fetch("/api/v1/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          article_id: opts.articleId,
          html: opts.html,
          messages: opts.messages,
        }),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        // HTTP 层失败(端点正常时恒 200,错误走流内帧):中文映射,不重试。
        opts.onError(friendlyErrorMessage({ response: { status: resp.status } }));
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        drainBuffer();
        if (terminal) break;
      }
      // 流尾可能残一帧无尾随空行
      if (!terminal && buffer.trim().length > 0) {
        dispatchFrame(buffer);
        buffer = "";
      }
      if (terminal || aborted) {
        opts.onClose?.();
        return;
      }
      // 流自然结束但没收到终态帧:不重连(见文件头),提示用户显式处理。
      opts.onError("AI 对话流意外中断,本轮修改可能只完成了一部分;可先「回到本轮之前」再重试");
    } catch (err) {
      if (aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      if (terminal) {
        opts.onClose?.();
        return;
      }
      opts.onError(friendlyErrorMessage(err));
    }
  };

  void run();

  return {
    abort: () => {
      aborted = true;
      terminal = true;
      controller.abort();
    },
    droppedFrames: () => dropped,
  };
}
