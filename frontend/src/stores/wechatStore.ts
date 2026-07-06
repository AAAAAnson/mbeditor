import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export interface WeChatAccount {
  id: string;
  name: string;
  appid: string;
  appsecret: string;
}

interface WeChatState {
  accounts: WeChatAccount[];
  activeAccountId: string | null;
  addAccount: (data: Omit<WeChatAccount, "id">) => string;
  updateAccount: (id: string, patch: Partial<Omit<WeChatAccount, "id">>) => void;
  removeAccount: (id: string) => void;
  setActive: (id: string | null) => void;
  getActiveAccount: () => WeChatAccount | null;
  reset: () => void;
}

type PersistedWeChatAccount = Omit<WeChatAccount, "appsecret">;

interface PersistedWeChatState {
  accounts: PersistedWeChatAccount[];
  activeAccountId: string | null;
}

function generateId(): string {
  return "acct_" + Math.random().toString(36).slice(2, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toPersistedWeChatState(state: Pick<WeChatState, "accounts" | "activeAccountId">): PersistedWeChatState {
  return {
    accounts: state.accounts.map(({ id, name, appid }) => ({ id, name, appid })),
    activeAccountId: state.activeAccountId,
  };
}

function hydrateWeChatAccounts(accounts: unknown): WeChatAccount[] {
  if (!Array.isArray(accounts)) {
    return [];
  }

  return accounts
    .filter(isRecord)
    .filter((account) => typeof account.id === "string")
    .map((account) => ({
      id: account.id as string,
      name: typeof account.name === "string" ? account.name : "",
      appid: typeof account.appid === "string" ? account.appid : "",
      appsecret: "",
    }));
}

function sanitizeWeChatStorageValue(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed) || !isRecord(parsed.state)) {
      return value;
    }

    const state = parsed.state;
    const sanitized: { state: PersistedWeChatState; version?: unknown } = {
      ...parsed,
      state: {
        accounts: hydrateWeChatAccounts(state.accounts).map(({ id, name, appid }) => ({ id, name, appid })),
        activeAccountId: typeof state.activeAccountId === "string" ? state.activeAccountId : null,
      },
    };

    return JSON.stringify(sanitized);
  } catch {
    return value;
  }
}

function createScrubbedLocalStorage(scrub: (value: string) => string): StateStorage {
  return {
    getItem: (name) => {
      const value = localStorage.getItem(name);
      if (value === null) {
        return null;
      }
      const scrubbed = scrub(value);
      if (scrubbed !== value) {
        localStorage.setItem(name, scrubbed);
      }
      return scrubbed;
    },
    setItem: (name, value) => localStorage.setItem(name, scrub(value)),
    removeItem: (name) => localStorage.removeItem(name),
  };
}

export const useWeChatStore = create<WeChatState>()(
  persist<WeChatState, [], [], PersistedWeChatState>(
    (set, get) => ({
      accounts: [],
      activeAccountId: null,
      addAccount: ({ name, appid, appsecret }) => {
        const id = generateId();
        set((state) => ({
          accounts: [...state.accounts, { id, name, appid, appsecret }],
          activeAccountId: state.activeAccountId ?? id,
        }));
        return id;
      },
      updateAccount: (id, patch) =>
        set((state) => ({
          accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
      removeAccount: (id) =>
        set((state) => {
          const accounts = state.accounts.filter((a) => a.id !== id);
          const activeAccountId =
            state.activeAccountId === id ? (accounts[0]?.id ?? null) : state.activeAccountId;
          return { accounts, activeAccountId };
        }),
      setActive: (id) => set({ activeAccountId: id }),
      getActiveAccount: () => {
        const { accounts, activeAccountId } = get();
        return accounts.find((a) => a.id === activeAccountId) ?? null;
      },
      reset: () => set({ accounts: [], activeAccountId: null }),
    }),
    {
      name: "mbeditor.wechat",
      storage: createJSONStorage<PersistedWeChatState>(() =>
        createScrubbedLocalStorage(sanitizeWeChatStorageValue)
      ),
      partialize: toPersistedWeChatState,
      merge: (persistedState, currentState) => {
        if (!isRecord(persistedState)) {
          return currentState;
        }

        return {
          ...currentState,
          accounts: hydrateWeChatAccounts(persistedState.accounts),
          activeAccountId:
            typeof persistedState.activeAccountId === "string" ? persistedState.activeAccountId : null,
        };
      },
    }
  )
);
