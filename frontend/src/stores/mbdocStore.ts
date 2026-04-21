import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MBDocRecord {
  id: string;
  title: string;
  data: unknown;
}

interface MBDocState {
  docs: MBDocRecord[];
  saveDoc: (doc: MBDocRecord) => void;
  getDoc: (id: string) => MBDocRecord | null;
  deleteDoc: (id: string) => void;
  replaceAll: (docs: MBDocRecord[]) => void;
}

export const useMBDocStore = create<MBDocState>()(
  persist(
    (set, get) => ({
      docs: [],
      saveDoc: (doc) =>
        set((state) => {
          const exists = state.docs.some((d) => d.id === doc.id);
          return {
            docs: exists ? state.docs.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...state.docs],
          };
        }),
      getDoc: (id) => get().docs.find((d) => d.id === id) ?? null,
      deleteDoc: (id) => set((state) => ({ docs: state.docs.filter((d) => d.id !== id) })),
      replaceAll: (docs) => set({ docs }),
    }),
    {
      name: "mbeditor.mbdocs",
      partialize: (state) => ({ docs: state.docs }),
    }
  )
);
