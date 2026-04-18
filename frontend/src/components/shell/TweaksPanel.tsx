import { useUIStore } from "@/stores/uiStore";
import { IconClose } from "@/components/icons";
import Seg from "@/components/ui/Seg";
import type { Theme, Density, Layout } from "@/stores/uiStore";

export default function TweaksPanel() {
  const { theme, setTheme, density, setDensity, layout, setLayout, tweaksOpen, setTweaksOpen } = useUIStore();

  if (!tweaksOpen) return null;

  return (
    <div
      className="slide-up"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        width: 280,
        background: "var(--surface)",
        border: "1px solid var(--border-2)",
        borderRadius: "var(--r-lg)",
        padding: 16,
        boxShadow: "0 24px 48px -16px rgba(0,0,0,0.7)",
        zIndex: 100,
        fontSize: 12,
      }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <span className="caps caps-gold">界面设置</span>
        <button className="btn btn-ghost btn-sm" style={{ padding: 4 }} onClick={() => setTweaksOpen(false)}>
          <IconClose size={12} />
        </button>
      </div>

      <TweakRow label="主题">
        <Seg
          options={[
            { value: "walnut", label: "胡桃" },
            { value: "paper", label: "纸面" },
            { value: "swiss", label: "瑞士" },
          ]}
          value={theme}
          onChange={(v) => setTheme(v as Theme)}
        />
      </TweakRow>

      <TweakRow label="密度">
        <Seg
          options={[
            { value: "compact", label: "紧凑" },
            { value: "comfy", label: "舒适" },
            { value: "spacious", label: "宽松" },
          ]}
          value={density}
          onChange={(v) => setDensity(v as Density)}
        />
      </TweakRow>

      <TweakRow label="布局">
        <Seg
          options={[
            { value: "focus", label: "单栏" },
            { value: "split", label: "双栏" },
            { value: "triptych", label: "三栏" },
          ]}
          value={layout}
          onChange={(v) => setLayout(v as Layout)}
        />
      </TweakRow>
    </div>
  );
}

function TweakRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "7px 0", gap: 8 }}>
      <span className="caps">{label}</span>
      {children}
    </div>
  );
}
