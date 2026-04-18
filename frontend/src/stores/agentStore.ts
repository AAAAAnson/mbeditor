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

function now(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  messages: [],
  activeMissions: [],
  model: "claude-sonnet-4.5",
  status: "idle" as AgentStatus,

  send: async (prompt: string) => {
    // 1. Add user message
    const userMsg: AgentMessage = {
      id: nextId(),
      t: now(),
      kind: "user",
      text: prompt,
    };
    set((state) => ({
      messages: [...state.messages, userMsg],
      status: "thinking" as AgentStatus,
    }));

    // 2. Simulate think step
    await delay(600);
    const thinkMsg: AgentMessage = {
      id: nextId(),
      t: now(),
      kind: "think",
      text: `正在理解你的需求：「${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}」`,
    };
    set((state) => ({
      messages: [...state.messages, thinkMsg],
      status: "editing" as AgentStatus,
    }));

    // 3. Simulate tool call
    await delay(400);
    const toolMsg: AgentMessage = {
      id: nextId(),
      t: now(),
      kind: "tool",
      method: "edit",
      path: "article.html",
      add: 12,
      remove: 3,
    };
    set((state) => ({
      messages: [...state.messages, toolMsg],
    }));

    // 4. Simulate assistant response
    await delay(500);
    const assistantMsg: AgentMessage = {
      id: nextId(),
      t: now(),
      kind: "assistant",
      text: `已经处理好了：「${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}」。改动已同步到文章里。`,
    };
    set((state) => ({
      messages: [...state.messages, assistantMsg],
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
