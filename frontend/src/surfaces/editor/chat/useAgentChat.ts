// frontend/src/surfaces/editor/chat/useAgentChat.ts
// Agent 对话式编辑的状态机 hook(批5,spec §3/§6;UI 组件在批6 ChatPanel)。
//
// 一轮 turn 的数据流:
//   send(text) → POST 全文 html + user/assistant 历史 → SSE:
//   checkpoint    建块表 + 记本轮 rev_id(「回到本轮之前」的锚点)
//   chat_token    增量拼进本轮 assistant 条目
//   tool_call/-result 工具活动条目 running → ok/failed
//   block_update  按增量更新块表 → 实时重建整篇回写 onHtmlChange
//   turn_done     以帧内 html 为准最终回写(权威锚点,覆盖增量重建;
//                 纯问答零修改则不回写)+ 汇总 changed_block_ids
//   error         error 态 + 中文消息;已回写内容保留(checkpoint 可恢复)
//
// abort 不回滚:保留已应用变更,系统条目提示可用「回到本轮之前」(rev_id 已落盘)。
import { useCallback, useEffect, useRef, useState } from "react";

import api from "@/lib/api";
import { streamChatTurn, type ChatStreamHandle, type ChatHistoryMessage } from "@/lib/chatStream";
import type { ChatEvent } from "@/types/agentChat";
import { countMediaBlocks } from "./mediaConservation";

/** 媒体守恒警告(H1 软加固):本轮相较 checkpoint 少了多少张图片/图形。 */
export interface MediaWarning {
  removed: number;
}

export type AgentChatStatus = "idle" | "streaming" | "error";

/** turn_done 时从本轮块表提取的改动块信息(ChatPanel 汇总卡 + 预览高亮用)。 */
export interface ChangedBlockInfo {
  id: string;
  kind: string;
  /** 纯文本摘要(剥标签截 40 字;图片/分隔等无文本块为空串)。 */
  text: string;
  /** 块在最终 order 中的序号(预览「第 N 个子元素」高亮定位;已删除为 -1)。 */
  index: number;
}

/** 消息流条目:user/assistant 文本 + 工具活动 + 系统提示。
 *  批6 起的可选字段(revId/args/summary/changedBlocks/blockCount)全部为
 *  UI 富化,批5 既有字段与语义零改。 */
export type ChatEntry =
  | { id: string; kind: "user"; text: string; revId?: string }
  | {
      id: string;
      kind: "assistant";
      text: string;
      changedBlockIds?: string[];
      changedBlocks?: ChangedBlockInfo[];
      /** turn_done 时 order 的块总数(高亮定位剥信封的停钻锚)。 */
      blockCount?: number;
    }
  | {
      id: string;
      kind: "tool";
      callId: string;
      name: string;
      status: "running" | "ok" | "failed";
      /** tool_call 的 arguments(中文动词化取块号用)。 */
      args?: Record<string, unknown>;
      /** tool_result 的 summary(repairs/violations fix_hint 摘要用)。 */
      summary?: unknown;
    }
  | { id: string; kind: "system"; text: string };

/** 快照元数据(GET /revisions/{article_id} 列表项,不含 html)。 */
export interface RevisionMeta {
  rev_id: string;
  ts?: string | number;
  reason?: string;
  [key: string]: unknown;
}

export interface UseAgentChatOptions {
  articleId: string;
  /** 取当前整篇 HTML(会话真源,send 时随请求上传)。 */
  getHtml: () => string;
  /** 回写整篇 HTML(EditorSurface 接编辑器真源)。 */
  onHtmlChange: (html: string) => void;
  /** 注入流客户端,测试用;默认真 streamChatTurn。 */
  stream?: typeof streamChatTurn;
}

export interface AgentChatApi {
  status: AgentChatStatus;
  entries: ChatEntry[];
  /** error 态的中文消息(idle/streaming 时为 null)。 */
  errorMessage: string | null;
  /** 最近一轮 checkpoint 的 rev_id(「回到本轮之前」用),尚无则 null。 */
  lastRevId: string | null;
  send: (text: string) => void;
  /** 中断当前流:保留已应用变更,不回滚。 */
  abort: () => void;
  /** 清空整段会话(对话/错误/rev_id/媒体警告)并回 idle:用于 docbar 恢复任意
   *  历史版本后——恢复后旧对话不再描述当前文档,须归零免下一轮带陈旧上下文。 */
  reset: () => void;
  /** 恢复到某个快照:GET 快照 → 回写 + 系统条目。streaming 中拒绝。 */
  restoreCheckpoint: (revId: string) => Promise<void>;
  /** 快照元数据列表(批6 UI 用)。 */
  listRevisions: () => Promise<RevisionMeta[]>;
  /** 本轮疑似丢图(相对 checkpoint 少了媒体块)则非 null,否则 null(H1 软加固,检测非阻止)。 */
  mediaWarning: MediaWarning | null;
  /** 关闭媒体守恒警告条(用户已知悉)。 */
  dismissMediaWarning: () => void;
}

export function useAgentChat({
  articleId,
  getHtml,
  onHtmlChange,
  stream = streamChatTurn,
}: UseAgentChatOptions): AgentChatApi {
  const [status, setStatus] = useState<AgentChatStatus>("idle");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRevId, setLastRevId] = useState<string | null>(null);
  const [mediaWarning, setMediaWarning] = useState<MediaWarning | null>(null);
  // checkpoint 时记录的媒体块基线;turn_done 后与当前块表比对(H1 软加固)。
  const mediaBaselineRef = useRef(0);

  const statusRef = useRef<AgentChatStatus>("idle");
  const entriesRef = useRef<ChatEntry[]>([]);
  const handleRef = useRef<ChatStreamHandle | null>(null);
  const seqRef = useRef(0);

  // 本轮块表(高亮/增量重建用;turn_done 的 html 才是正确性锚点)。
  const blocksRef = useRef<Map<string, { kind: string; html: string }>>(new Map());
  const orderRef = useRef<string[]>([]);
  const shellRef = useRef({ open: "", close: "" });
  const assistantIdRef = useRef<string | null>(null);
  const wroteRef = useRef(false); // 本轮是否发生过 block_update 回写

  const nextId = () => `ce${++seqRef.current}`;

  const setStatusBoth = (next: AgentChatStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  /** entries 的唯一写入口:同步 ref(send 需要同步读历史)+ state。 */
  const updateEntries = (fn: (prev: ChatEntry[]) => ChatEntry[]) => {
    entriesRef.current = fn(entriesRef.current);
    setEntries(entriesRef.current);
  };

  const appendAssistantText = (text: string) => {
    if (assistantIdRef.current === null) {
      const id = nextId();
      assistantIdRef.current = id;
      updateEntries((prev) => [...prev, { id, kind: "assistant", text }]);
      return;
    }
    const id = assistantIdRef.current;
    updateEntries((prev) =>
      prev.map((e) => (e.id === id && e.kind === "assistant" ? { ...e, text: e.text + text } : e)),
    );
  };

  /** 块 html → 纯文本摘要(汇总卡展示用)。 */
  const blockDigest = (html: string): string =>
    html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);

  /** 块表 → 整篇 HTML(shell_open + 按 order 拼块 + shell_close)。 */
  const rebuildHtml = (): string => {
    const body = orderRef.current
      .map((bid) => blocksRef.current.get(bid)?.html ?? "")
      .join("");
    return shellRef.current.open + body + shellRef.current.close;
  };

  const failTurn = (message: string) => {
    // 已回写内容保留(不回滚)——checkpoint 已落盘,用户可显式恢复。
    setErrorMessage(message);
    setStatusBoth("error");
  };

  const handleEvent = (ev: ChatEvent) => {
    switch (ev.type) {
      case "checkpoint": {
        shellRef.current = { open: ev.shell_open, close: ev.shell_close };
        orderRef.current = [...ev.order];
        blocksRef.current = new Map(ev.blocks.map((b) => [b.id, { kind: b.kind, html: b.html }]));
        // 媒体守恒基线:本轮开工时的图片/图形块数。
        mediaBaselineRef.current = countMediaBlocks(ev.blocks);
        setLastRevId(ev.rev_id);
        // 本轮 user 条目挂 rev_id:ChatPanel 轮次卡「回到此轮之前」的锚点。
        updateEntries((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) {
            const e = prev[i];
            if (e.kind === "user") {
              if (e.revId === ev.rev_id) return prev;
              const next = [...prev];
              next[i] = { ...e, revId: ev.rev_id };
              return next;
            }
          }
          return prev;
        });
        return;
      }
      case "chat_token": {
        appendAssistantText(ev.text);
        return;
      }
      case "tool_call": {
        const entry: ChatEntry = {
          id: nextId(),
          kind: "tool",
          callId: ev.id,
          name: ev.name,
          status: "running",
          args: ev.arguments,
        };
        updateEntries((prev) => [...prev, entry]);
        return;
      }
      case "tool_result": {
        updateEntries((prev) =>
          prev.map((e) =>
            e.kind === "tool" && e.callId === ev.id && e.status === "running"
              ? { ...e, status: ev.ok ? "ok" : "failed", summary: ev.summary }
              : e,
          ),
        );
        return;
      }
      case "block_update": {
        for (const b of ev.changed_blocks) {
          blocksRef.current.set(b.id, { kind: b.kind, html: b.html });
        }
        for (const bid of ev.deleted_ids) {
          blocksRef.current.delete(bid);
        }
        orderRef.current = [...ev.order];
        wroteRef.current = true;
        onHtmlChange(rebuildHtml()); // 实时回写(预览跟手)
        return;
      }
      case "turn_done": {
        // 权威锚点:以帧内 html 为准覆盖增量重建;纯问答零修改则不回写(不脏编辑器)。
        if (wroteRef.current || ev.changed_block_ids.length > 0) {
          onHtmlChange(ev.html);
        }
        if (assistantIdRef.current === null && ev.summary) {
          appendAssistantText(ev.summary);
        }
        const aid = assistantIdRef.current;
        if (aid !== null) {
          // 汇总数据从本轮块表提取(kind/文本摘要/order 序号),供汇总卡与
          // 预览高亮;正确性锚点仍是帧内 html,块表只做展示。
          const changedBlocks = ev.changed_block_ids.map((bid): ChangedBlockInfo => {
            const b = blocksRef.current.get(bid);
            return {
              id: bid,
              kind: b?.kind ?? "text",
              text: blockDigest(b?.html ?? ""),
              index: orderRef.current.indexOf(bid),
            };
          });
          const blockCount = orderRef.current.length;
          updateEntries((prev) =>
            prev.map((e) =>
              e.id === aid && e.kind === "assistant"
                ? { ...e, changedBlockIds: [...ev.changed_block_ids], changedBlocks, blockCount }
                : e,
            ),
          );
        }
        // 媒体守恒检测(非阻止):本轮块表媒体块少于 checkpoint 基线 → 暴露警告。
        const mediaNow = countMediaBlocks([...blocksRef.current.values()]);
        const removed = mediaBaselineRef.current - mediaNow;
        setMediaWarning(removed > 0 ? { removed } : null);
        setStatusBoth("idle");
        return;
      }
      case "error": {
        failTurn(ev.message);
        return;
      }
    }
  };

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (statusRef.current === "streaming") return; // 并发防护:一轮未完拒绝下一轮

      // 历史 = 既有 user/assistant 文本条目(工具/系统条目不进对话历史)。
      const history: ChatHistoryMessage[] = entriesRef.current
        .filter((e): e is Extract<ChatEntry, { kind: "user" | "assistant" }> =>
          e.kind === "user" || e.kind === "assistant",
        )
        .map((e) => ({ role: e.kind, content: e.text }));
      const messages: ChatHistoryMessage[] = [...history, { role: "user", content: trimmed }];

      updateEntries((prev) => [...prev, { id: nextId(), kind: "user", text: trimmed }]);
      setErrorMessage(null);
      setMediaWarning(null); // 新一轮清掉上一轮的丢图警告

      // 重置本轮流中状态。
      assistantIdRef.current = null;
      wroteRef.current = false;
      blocksRef.current = new Map();
      orderRef.current = [];
      shellRef.current = { open: "", close: "" };

      setStatusBoth("streaming");
      handleRef.current = stream({
        articleId,
        html: getHtml(),
        messages,
        onEvent: handleEvent,
        onError: failTurn,
      });
    },
    // getHtml/onHtmlChange/stream 由调用方保证稳定(EditorSurface 传 ref 包装)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [articleId, stream],
  );

  const abort = useCallback(() => {
    if (statusRef.current !== "streaming") return;
    handleRef.current?.abort();
    // 中断保留已应用变更;rev_id 已落盘,提示可显式恢复。
    updateEntries((prev) => [
      ...prev,
      {
        id: nextId(),
        kind: "system",
        text: "已中断本轮 AI 修改;已应用的改动保留,可用「回到本轮之前」恢复",
      },
    ]);
    setStatusBoth("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 清空整段会话并回 idle(中止在跑的流,不回滚已应用变更)。切文章与 docbar
   *  恢复共用:恢复/切换后旧对话不再对应当前文档,归零免下一轮带陈旧上下文。 */
  const reset = useCallback(() => {
    handleRef.current?.abort();
    entriesRef.current = [];
    setEntries([]);
    setErrorMessage(null);
    setLastRevId(null);
    setMediaWarning(null);
    statusRef.current = "idle";
    setStatus("idle");
  }, []);

  const restoreCheckpoint = useCallback(
    async (revId: string) => {
      if (statusRef.current === "streaming") {
        throw new Error("AI 正在修改中,请先中断本轮再恢复");
      }
      const res = await api.get(`/revisions/${articleId}/${revId}`);
      const env = (res?.data ?? {}) as { code?: number; message?: string; data?: { html?: unknown } };
      if (env.code !== 0 || typeof env.data?.html !== "string") {
        throw new Error(env.message && typeof env.message === "string" ? env.message : "快照读取失败,请稍后重试");
      }
      onHtmlChange(env.data.html);
      // 撤销这一轮 = 对话也遗忘该轮及其之后的所有条目:否则下一轮 send 会带着
      // 被撤销轮的陈旧 assistant 上下文(如「已换成干货利落」),模型据此误判当前
      // 文档状态,产出与实际文档矛盾的改写。锚点 = checkpoint 时盖在该轮 user 条目
      // 上的 revId;找不到(恢复的是非本会话轮次)则不裁剪,仅追加系统提示。
      const sysEntry: ChatEntry = { id: nextId(), kind: "system", text: "已回到本轮修改之前的版本" };
      updateEntries((prev) => {
        const cut = prev.findIndex((e) => e.kind === "user" && e.revId === revId);
        const kept = cut >= 0 ? prev.slice(0, cut) : prev;
        return [...kept, sysEntry];
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [articleId],
  );

  const dismissMediaWarning = useCallback(() => setMediaWarning(null), []);

  const listRevisions = useCallback(async (): Promise<RevisionMeta[]> => {
    const res = await api.get(`/revisions/${articleId}`);
    const env = (res?.data ?? {}) as { code?: number; message?: string; data?: { revisions?: RevisionMeta[] } };
    if (env.code !== 0) {
      throw new Error(env.message && typeof env.message === "string" ? env.message : "快照列表读取失败,请稍后重试");
    }
    return env.data?.revisions ?? [];
  }, [articleId]);

  // 切文章(同一挂载内 articleId 变化):中止流 + 清空会话,防止 A 文章的
  // 对话历史/rev_id 串进 B 文章(内部防御,不改对外 API)。
  const prevArticleIdRef = useRef(articleId);
  useEffect(() => {
    if (prevArticleIdRef.current === articleId) return;
    prevArticleIdRef.current = articleId;
    reset();
  }, [articleId, reset]);

  // 卸载/切文章:中止流,不留悬挂请求(不回滚,与 abort 语义一致)。
  useEffect(() => {
    return () => {
      handleRef.current?.abort();
    };
  }, []);

  return {
    status,
    entries,
    errorMessage,
    lastRevId,
    send,
    abort,
    reset,
    restoreCheckpoint,
    listRevisions,
    mediaWarning,
    dismissMediaWarning,
  };
}
