import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import Toast from "@/components/ui/Toast";
import api from "@/lib/api";

function VersionBanner() {
  const [update, setUpdate] = useState<{ latest: string; current: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const key = "mbeditor_version_check";
    const cached = sessionStorage.getItem(key);
    if (cached === "dismissed") return;

    api.get("/version/check").then((res) => {
      if (res.data.code !== 0) return;
      const { current, latest, has_update } = res.data.data;
      if (has_update) {
        setUpdate({ latest, current });
      }
    }).catch(() => {});
  }, []);

  if (!update || dismissed) return null;

  return (
    <div className="bg-accent/90 text-white text-[13px] text-center py-1.5 px-4 flex items-center justify-center gap-3 shrink-0">
      <span>
        新版本 <strong>v{update.latest}</strong> 已发布（当前 v{update.current}）—
        运行 <code className="bg-white/20 px-1.5 py-0.5 rounded text-[12px]">git pull && docker compose up --build -d</code> 升级
      </span>
      <button
        onClick={() => { setDismissed(true); sessionStorage.setItem("mbeditor_version_check", "dismissed"); }}
        className="text-white/70 hover:text-white text-[16px] leading-none cursor-pointer"
      >
        ×
      </button>
    </div>
  );
}

export default function MainLayout() {
  useTheme();

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-fg-primary">
      <VersionBanner />
      <Outlet />
      <Toast />
    </div>
  );
}
