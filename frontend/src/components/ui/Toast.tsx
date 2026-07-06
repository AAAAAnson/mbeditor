import { useEffect, useState } from "react";
import { IconClose } from "@/components/icons";
import { useToastStore } from "@/stores/toastStore";
import type { ToastType } from "@/types";

const TONE_COLORS: Record<ToastType, string> = {
  success: "var(--success)",
  error: "var(--danger)",
  warning: "var(--warning)",
  info: "var(--info)",
};

function ToastItem({
  id,
  type,
  message,
  onRemove,
}: {
  id: string;
  type: ToastType;
  message: string;
  onRemove: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger slide-in on next frame
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        overflow: "hidden",
        minWidth: 260,
        // 窄屏(移动 390)下让出左右各 16px,避免贴边/超出视口;桌面仍封顶 380。
        maxWidth: "min(380px, calc(100vw - 32px))",
        boxShadow: "var(--sh-lg)",
        transform: visible ? "translateX(0)" : "translateX(120%)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.3s ease, opacity 0.3s ease",
      }}
    >
      <div
        style={{
          width: 4,
          flexShrink: 0,
          background: TONE_COLORS[type],
        }}
      />

      <div
        style={{
          flex: 1,
          padding: "12px 14px",
          fontFamily: "var(--f-sans)",
          fontSize: 13,
          color: "var(--ink)",
          lineHeight: 1.4,
        }}
      >
        {message}
      </div>

      <button
        aria-label="关闭通知"
        onClick={() => onRemove(id)}
        style={{
          all: "unset",
          display: "grid",
          placeItems: "center",
          width: 36,
          minHeight: 44,
          alignSelf: "stretch",
          cursor: "pointer",
          color: "var(--ink-faint)",
          flexShrink: 0,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--ink-soft)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--ink-faint)";
        }}
      >
        <IconClose size={10} />
      </button>
    </div>
  );
}

export default function Toast() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        // 落在顶栏(--topbar-h)之下,再让出编辑器右侧「兼容性校验」面板表头那一带,
        // 避免「已套用模板」等 toast 一进编辑器就压住该面板表头、两层文字叠压。
        top: "calc(var(--topbar-h) + 36px)",
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem
            id={t.id}
            type={t.type}
            message={t.message}
            onRemove={removeToast}
          />
        </div>
      ))}
    </div>
  );
}
