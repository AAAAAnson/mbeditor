import { useState, useEffect } from "react";
import api from "../../lib/api";

export default function AboutSection() {
  const [version, setVersion] = useState("...");

  useEffect(() => {
    api.get("/version").then((res) => {
      const v = res.data?.data?.version;
      if (v) setVersion(v.startsWith("v") ? v : `v${v}`);
    }).catch(() => setVersion("未知"));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[18px] font-bold text-fg-primary">关于 MBEditor</h2>
        <p className="text-[13px] text-fg-muted">版本信息与项目说明</p>
      </div>

      <div className="bg-surface-secondary rounded-xl border border-border-primary p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-fg-secondary">版本</span>
          <span className="text-[13px] text-fg-primary font-mono">{version}</span>
        </div>

        <div className="h-px w-full bg-border-primary" />

        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-fg-secondary">简介</span>
          <p className="text-[13px] text-fg-muted leading-relaxed">
            MBEditor 是一款 AI 驱动的微信公众号排版编辑器，支持 Markdown 编写、实时预览、一键推送至微信公众号草稿箱。
          </p>
        </div>

        <div className="h-px w-full bg-border-primary" />

        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-fg-secondary">技术栈</span>
          <p className="text-[13px] text-fg-muted leading-relaxed">
            React 19 + TypeScript + Tailwind CSS + FastAPI + Docker
          </p>
        </div>
      </div>
    </div>
  );
}
