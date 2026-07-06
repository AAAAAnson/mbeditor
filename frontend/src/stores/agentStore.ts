import { create } from "zustand";
import type { AgentMessage, Mission } from "@/types";

type AgentStatus = "idle" | "thinking" | "editing" | "error";

interface AgentState {
  messages: AgentMessage[];
  activeMissions: Mission[];
  model: string;
  status: AgentStatus;

  send: (prompt: string) => Promise<void>;
  cancelMission: (id: string) => void;
  clearMessages: () => void;
  setModel: (model: string) => void;
}

let msgCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  messages: [],
  activeMissions: [],
  model: "claude-sonnet-4.5",
  status: "idle" as AgentStatus,

  send: async (prompt: string) => {
    // 真流式生成走 ComposeSurface + lib/agentStream(POST /agent/write)。
    // 此 store 不再伪造 think/tool/assistant 假消息;仅登记用户输入。
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const userMsg: AgentMessage = {
      id: nextId(),
      t: new Date().toISOString(),
      kind: "user",
      text: trimmed,
    };
    set((state) => ({
      messages: [...state.messages, userMsg],
      status: "idle" as AgentStatus,
    }));
  },

  cancelMission: (id: string) => {
    set((state) => ({
      activeMissions: state.activeMissions.filter((m) => m.id !== id),
    }));
  },

  clearMessages: () => {
    set({ messages: [], status: "idle" as AgentStatus });
  },

  setModel: (model: string) => {
    set({ model });
  },
}));
