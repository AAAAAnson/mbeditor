import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MBDoc, MBDocSummary, Block } from "@/types";
import api from "@/lib/api";
import type { ApiResponse } from "@/types";

interface MBDocState {
  // Local cache
  docs: MBDoc[];
  currentDocId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchDocs: () => Promise<void>;
  fetchDoc: (id: string) => Promise<MBDoc>;
  createDoc: (title: string, blocks?: Block[]) => Promise<MBDoc>;
  updateDoc: (id: string, data: Partial<MBDoc>) => Promise<MBDoc>;
  deleteDoc: (id: string) => Promise<void>;
  setCurrentDoc: (id: string | null) => void;

  // Local operations
  saveDocLocal: (doc: MBDoc) => void;
  getDocLocal: (id: string) => MBDoc | null;
  deleteDocLocal: (id: string) => void;
  replaceAllLocal: (docs: MBDoc[]) => void;
}

function unwrapResponse<T>(response: ApiResponse<T>): T {
  if (response.code !== 0) {
    throw new Error(response.message || "Request failed");
  }
  return response.data;
}

export const useMBDocStore = create<MBDocState>()(
  persist(
    (set, get) => ({
      docs: [],
      currentDocId: null,
      loading: false,
      error: null,

      // Fetch all documents from API
      fetchDocs: async () => {
        set({ loading: true, error: null });
        try {
          const res = await api.get<ApiResponse<MBDocSummary[]>>("/mbdocs");
          const summaries = unwrapResponse(res.data);
          
          // Update local cache with summaries (without full block data)
          const currentDocs = get().docs;
          const updatedDocs = summaries.map((summary) => {
            const existing = currentDocs.find((d) => d.id === summary.id);
            if (existing) {
              return { ...existing, meta: { ...existing.meta, title: summary.title } };
            }
            return {
              id: summary.id,
              version: "1" as const,
              meta: { title: summary.title, author: summary.author },
              blocks: [],
            };
          });
          
          set({ docs: updatedDocs, loading: false });
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : "Failed to fetch documents",
            loading: false 
          });
        }
      },

      // Fetch single document from API
      fetchDoc: async (id: string) => {
        set({ loading: true, error: null });
        try {
          const res = await api.get<ApiResponse<MBDoc>>(`/mbdocs/${id}`);
          const doc = unwrapResponse(res.data);
          
          // Update in local cache
          set((state) => ({
            docs: state.docs.map((d) => (d.id === id ? doc : d)),
            currentDocId: id,
            loading: false,
          }));
          
          return doc;
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : "Failed to fetch document",
            loading: false 
          });
          throw error;
        }
      },

      // Create new document via API
      createDoc: async (title: string, blocks: Block[] = []) => {
        set({ loading: true, error: null });
        try {
          const res = await api.post<ApiResponse<MBDoc>>("/mbdocs", {
            title,
            blocks,
          });
          const doc = unwrapResponse(res.data);
          
          // Add to local cache
          set((state) => ({
            docs: [doc, ...state.docs],
            currentDocId: doc.id,
            loading: false,
          }));
          
          return doc;
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : "Failed to create document",
            loading: false 
          });
          throw error;
        }
      },

      // Update document via API
      updateDoc: async (id: string, data: Partial<MBDoc>) => {
        set({ loading: true, error: null });
        try {
          const res = await api.put<ApiResponse<MBDoc>>(`/mbdocs/${id}`, {
            title: data.meta?.title,
            author: data.meta?.author,
            digest: data.meta?.digest,
            cover: data.meta?.cover,
            blocks: data.blocks,
          });
          const doc = unwrapResponse(res.data);
          
          // Update in local cache
          set((state) => ({
            docs: state.docs.map((d) => (d.id === id ? doc : d)),
            loading: false,
          }));
          
          return doc;
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : "Failed to update document",
            loading: false 
          });
          throw error;
        }
      },

      // Delete document via API
      deleteDoc: async (id: string) => {
        set({ loading: true, error: null });
        try {
          await api.delete(`/mbdocs/${id}`);
          
          // Remove from local cache
          set((state) => ({
            docs: state.docs.filter((d) => d.id !== id),
            currentDocId: state.currentDocId === id ? null : state.currentDocId,
            loading: false,
          }));
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : "Failed to delete document",
            loading: false 
          });
          throw error;
        }
      },

      // Set current document
      setCurrentDoc: (id: string | null) => set({ currentDocId: id }),

      // Local operations (for offline/optimistic updates)
      saveDocLocal: (doc: MBDoc) =>
        set((state) => {
          const exists = state.docs.some((d) => d.id === doc.id);
          return {
            docs: exists ? state.docs.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...state.docs],
          };
        }),
      getDocLocal: (id: string) => get().docs.find((d) => d.id === id) ?? null,
      deleteDocLocal: (id: string) =>
        set((state) => ({
          docs: state.docs.filter((d) => d.id !== id),
          currentDocId: state.currentDocId === id ? null : state.currentDocId,
        })),
      replaceAllLocal: (docs: MBDoc[]) => set({ docs }),
    }),
    {
      name: "mbeditor.mbdocs",
      partialize: (state) => ({ docs: state.docs }),
    }
  )
);
