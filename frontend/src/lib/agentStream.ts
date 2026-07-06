// frontend/src/lib/agentStream.ts
// axios 不支持流式 → fetch + ReadableStream 读 text/event-stream。断连自动重连 1 次。
import type { AgentEvent } from "@/types/agent";

export interface AgentStreamHandlers {
  onEvent: (event: AgentEvent) => void; // 每条解析后的 SSE 事件
  onError: (message: string) => void; // 仅传输层失败;固定语义 code="stream_error"
  onClose?: () => void; // 流正常结束(done 后)
}

export interface AgentStreamHandle {
  abort: () => void; // 调用方取消(组件卸载/用户中止)
}

// 断连后最多自动重连的次数(契约:重连 1 次)。
const MAX_RETRIES = 1;

/**
 * 打开 SSE 流。POST `url`(默认应传 "/api/v1/agent/write")+ JSON body。
 * - 逐 `\n\n` 切帧,剥 `data: ` 前缀,JSON.parse → onEvent。
 * - 网络/读流中断且未收到 done → 自动重连 1 次;再失败 → onError("stream_error", msg)。
 * - 收到 type==="done" 或 type==="error" 后停止重连。
 * 返回 handle,组件 useEffect cleanup 里调 handle.abort()。
 */
export function agentStream(
  url: string,
  body: unknown,
  handlers: AgentStreamHandlers,
): AgentStreamHandle {
  const controller = new AbortController();
  let aborted = false;
  let terminal = false; // 收到 done/error 业务终态后置真,杜绝重连
  let buffer = ""; // 跨 chunk 残帧缓冲

  const dispatchFrame = (raw: string): void => {
    // raw 是一条以空行分隔的 SSE 记录,可能含多行;只取 data: 行拼起来。
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (dataLines.length === 0) return; // 注释/心跳行
    const payload = dataLines.join("\n");
    if (payload === "[DONE]") return;
    let event: AgentEvent;
    try {
      event = JSON.parse(payload) as AgentEvent;
    } catch {
      return; // 半截/坏 json,丢弃(跨 chunk 半帧已被 buffer 兜住)
    }
    if (event.type === "done" || event.type === "error" || event.type === "rewrite_done") {
      terminal = true;
    }
    handlers.onEvent(event);
  };

  const drainBuffer = (): void => {
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const record = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (record.length > 0) dispatchFrame(record);
    }
  };

  const run = async (attempt: number): Promise<void> => {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
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
        handlers.onClose?.();
        return;
      }
      // 流自然结束但没收到 done → 视为断连,尝试重连
      throw new Error("stream ended without done");
    } catch (err) {
      if (aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      if (terminal) {
        handlers.onClose?.();
        return;
      }
      if (attempt < MAX_RETRIES) {
        buffer = "";
        return run(attempt + 1);
      }
      const msg = err instanceof Error ? err.message : String(err);
      handlers.onError(`AI 流连接失败(${msg})`);
    }
  };

  void run(0);

  return {
    abort: () => {
      aborted = true;
      terminal = true;
      controller.abort();
    },
  };
}
