import { create } from "zustand";
import type { Toast, ToastType } from "@/types";

interface ToastState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => string;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  addToast: (type: ToastType, message: string) => {
    const id = `toast-${Date.now()}-${++toastCounter}`;
    const entry: Toast = { id, type, message };

    set((state) => ({ toasts: [...state.toasts, entry] }));

    // Auto-remove after 4 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4000);

    return id;
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

/** Convenience helpers for one-liner toast calls */
export const toast = {
  success: (message: string) => useToastStore.getState().addToast("success", message),
  error: (message: string) => useToastStore.getState().addToast("error", message),
  warning: (message: string) => useToastStore.getState().addToast("warning", message),
  info: (message: string) => useToastStore.getState().addToast("info", message),
};
