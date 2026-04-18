import { useState, useEffect } from "react";
import { IconWechat, IconCheck, IconClose } from "@/components/icons";
import Chip from "@/components/shared/Chip";
import { useUIStore, type Theme, type Layout, type Density } from "@/stores/uiStore";
import { toast } from "@/stores/toastStore";
import api from "@/lib/api";
import type { Route } from "@/types";

type Section = "wechat" | "appearance" | "editor" | "about";

const NAV_ITEMS: { key: Section; label: string }[] = [
  { key: "wechat", label: "公众号" },
  { key: "appearance", label: "界面" },
  { key: "editor", label: "编辑" },
  { key: "about", label: "关于" },
];

const THEMES: { key: Theme; label: string; fg: string; bg: string; accent: string }[] = [
  { key: "walnut", label: "胡桃", fg: "#c8b89a", bg: "#1a1612", accent: "#c8956c" },
  { key: "paper", label: "纸面", fg: "#333", bg: "#f5f0e8", accent: "#b8860b" },
  { key: "swiss", label: "瑞士", fg: "#222", bg: "#fff", accent: "#e30613" },
];

const LAYOUTS: { key: Layout; label: string; desc: string }[] = [
  { key: "focus", label: "单栏", desc: "只看编辑区" },
  { key: "split", label: "双栏", desc: "编辑区 + 预览区" },
  { key: "triptych", label: "三栏", desc: "大纲 + 编辑区 + 预览区" },
];

const DENSITIES: { key: Density; label: string; desc: string }[] = [
  { key: "compact", label: "紧凑", desc: "信息更密，列表行高更小" },
  { key: "comfy", label: "舒适", desc: "默认节奏，便于日常编辑" },
  { key: "spacious", label: "宽松", desc: "更大留白，便于浏览" },
];

interface Props {
  go: (route: Route, params?: Record<string, string>) => void;
}

type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
};

type ConfigPayload = {
  appid?: string;
  app_id?: string;
  appsecret?: string;
  app_secret?: string;
  configured?: boolean;
  account_name?: string;
  valid?: boolean;
};

type VersionPayload = {
  version?: string;
  repo?: string;
};

const FALLBACK_REPO = "AAAAAnson/mbeditor";

function unwrapApiData<T>(payload: unknown): T | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const envelope = payload as ApiEnvelope<T>;
  if (typeof envelope.code === "number" || "data" in envelope || "message" in envelope) {
    if (typeof envelope.code === "number" && envelope.code !== 0) {
      throw new Error(envelope.message || "请求失败");
    }
    return envelope.data;
  }

  return payload as T;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    try {
      const data = unwrapApiData(response?.data);
      if (typeof data === "string" && data) {
        return data;
      }
    } catch (apiError) {
      if (apiError instanceof Error && apiError.message) {
        return apiError.message;
      }
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function normalizeConfig(payload?: ConfigPayload) {
  const appid = payload?.appid ?? payload?.app_id ?? "";
  const maskedSecret = payload?.appsecret ?? payload?.app_secret ?? "";

  return {
    appid,
    accountName: payload?.account_name ?? "",
    configured: Boolean(payload?.configured ?? (appid && maskedSecret)),
    hasStoredSecret: Boolean(maskedSecret),
  };
}

function buildRepoUrl(repo?: string): string {
  const normalized = (repo || FALLBACK_REPO).trim();
  if (!normalized) {
    return `https://github.com/${FALLBACK_REPO}`;
  }

  if (/^https?:\/\//.test(normalized)) {
    return normalized;
  }

  return `https://github.com/${normalized.replace(/^github\.com\//, "").replace(/^\/+/, "")}`;
}

export default function SettingsSurface({ go: _go }: Props) {
  const [section, setSection] = useState<Section>("wechat");

  return (
    <div className="flex" style={{ height: "100%", overflow: "hidden" }}>
      {/* Sidebar */}
      <nav
        style={{
          width: 200,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-deep)",
          padding: "20px 0",
          flexShrink: 0,
        }}
      >
        <div
          className="caps"
          style={{
            padding: "0 16px 12px",
            fontSize: 9,
            letterSpacing: "0.15em",
            color: "var(--gold)",
            borderBottom: "1px solid var(--border)",
            marginBottom: 8,
          }}
        >
          设置
        </div>
        {NAV_ITEMS.map((item) => {
          const active = section === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              style={{
                all: "unset",
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 16px",
                fontFamily: "var(--f-mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: active ? "var(--fg)" : "var(--fg-4)",
                background: active ? "var(--accent-soft)" : "transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 32 }}>
        {section === "wechat" && <WeChatSection />}
        {section === "appearance" && <AppearanceSection />}
        {section === "editor" && <EditorSection />}
        {section === "about" && <AboutSection />}
      </div>
    </div>
  );
}

/* ── WeChat Section ─────────────────────────────── */

function WeChatSection() {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [configured, setConfigured] = useState(false);
  const [hasStoredSecret, setHasStoredSecret] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/config").then((res) => {
      const data = normalizeConfig(unwrapApiData<ConfigPayload>(res.data));
      setAppId(data.appid);
      setConfigured(data.configured);
      setHasStoredSecret(data.hasStoredSecret);
      setAccountName(data.accountName);
      setAppSecret("");
    }).catch(() => {});
  }, []);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.post("/config/test", {
        appid: appId.trim(),
        appsecret: appSecret.trim(),
      });
      const data = unwrapApiData<ConfigPayload>(res.data);

      setConfigured(true);
      setHasStoredSecret(true);
      setAppSecret("");
      setAccountName(data?.account_name || accountName || "已连接公众号");
      toast.success("连接成功");
    } catch (error) {
      toast.error(getErrorMessage(error, "连接失败，请检查 AppID 和 AppSecret"));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put("/config", {
        appid: appId.trim(),
        appsecret: appSecret.trim(),
      });
      const data = normalizeConfig(unwrapApiData<ConfigPayload>(res.data));

      setConfigured(data.configured);
      setHasStoredSecret(data.hasStoredSecret);
      setAppSecret("");
      if (data.accountName) {
        setAccountName(data.accountName);
      }
      toast.success("设置已保存");
    } catch (error) {
      toast.error(getErrorMessage(error, "保存失败，请稍后再试"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <SectionHeader label="公众号" />

      <div className="flex items-center" style={{ gap: 8, marginBottom: 24 }}>
        <IconWechat size={16} />
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--fg-2)" }}>
          连接公众号
        </span>
        {configured ? (
          <Chip tone="forest" style={{ marginLeft: "auto" }}>
            <IconCheck size={10} /> 已配置
          </Chip>
        ) : (
          <Chip tone="warn" style={{ marginLeft: "auto" }}>未配置</Chip>
        )}
      </div>

      {accountName && (
        <div style={{ marginBottom: 20, padding: "8px 12px", background: "var(--surface-2)", borderRadius: "var(--r-sm)" }}>
          <span className="caps" style={{ fontSize: 9, color: "var(--fg-4)", letterSpacing: "0.1em" }}>公众号名称</span>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--fg)", marginTop: 4 }}>{accountName}</div>
        </div>
      )}

      <FieldGroup label="AppID">
        <input
          type="text"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="wx..."
          style={inputStyle}
        />
      </FieldGroup>

      <FieldGroup label="AppSecret">
        <input
          type="password"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          placeholder={hasStoredSecret ? "已保存，留空会继续使用当前密钥" : "请输入 AppSecret"}
          style={inputStyle}
        />
      </FieldGroup>

      {hasStoredSecret && (
        <div style={{ marginTop: -8, marginBottom: 16, fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--fg-4)" }}>
          当前密钥已经保存。只有输入新值时，才会覆盖原来的密钥。
        </div>
      )}

      <div className="flex" style={{ gap: 8, marginTop: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={handleTest} disabled={testing || !appId.trim()}>
          {testing ? "连接中..." : "测试连接"}
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !appId.trim()}>
          {saving ? "保存中..." : "保存设置"}
        </button>
      </div>
    </div>
  );
}

/* ── Appearance Section ─────────────────────────── */

function AppearanceSection() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const density = useUIStore((s) => s.density);
  const setDensity = useUIStore((s) => s.setDensity);
  const layout = useUIStore((s) => s.layout);
  const setLayout = useUIStore((s) => s.setLayout);

  return (
    <div style={{ maxWidth: 560 }}>
      <SectionHeader label="界面" />

      <SubLabel>主题</SubLabel>
      <div className="flex" style={{ gap: 12, marginBottom: 28 }}>
        {THEMES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTheme(t.key)}
            style={{
              all: "unset",
              flex: 1,
              border: theme === t.key ? "2px solid var(--accent)" : "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              padding: 12,
              cursor: "pointer",
              transition: "border 0.15s",
              background: "var(--surface)",
            }}
          >
            <div className="flex" style={{ gap: 6, marginBottom: 8 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: t.bg, border: "1px solid var(--border)" }} />
              <span style={{ width: 16, height: 16, borderRadius: 4, background: t.fg }} />
              <span style={{ width: 16, height: 16, borderRadius: 4, background: t.accent }} />
            </div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: theme === t.key ? "var(--fg)" : "var(--fg-3)" }}>
              {t.label}
            </div>
            {theme === t.key && (
              <div style={{ marginTop: 6 }}>
                <Chip tone="accent" style={{ fontSize: 9 }}>当前</Chip>
              </div>
            )}
          </button>
        ))}
      </div>

      <SubLabel>密度</SubLabel>
      <div className="flex" style={{ gap: 12, marginBottom: 28 }}>
        {DENSITIES.map((item) => (
          <button
            key={item.key}
            onClick={() => setDensity(item.key)}
            style={{
              all: "unset",
              flex: 1,
              border: density === item.key ? "2px solid var(--accent)" : "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              padding: 12,
              cursor: "pointer",
              transition: "border 0.15s",
              background: "var(--surface)",
            }}
          >
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: density === item.key ? "var(--fg)" : "var(--fg-3)" }}>
              {item.label}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 4 }}>{item.desc}</div>
            {density === item.key && (
              <div style={{ marginTop: 6 }}>
                <Chip tone="accent" style={{ fontSize: 9 }}>当前</Chip>
              </div>
            )}
          </button>
        ))}
      </div>

      <SubLabel>布局</SubLabel>
      <div className="flex" style={{ gap: 12 }}>
        {LAYOUTS.map((l) => (
          <button
            key={l.key}
            onClick={() => setLayout(l.key)}
            style={{
              all: "unset",
              flex: 1,
              border: layout === l.key ? "2px solid var(--accent)" : "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              padding: 12,
              cursor: "pointer",
              transition: "border 0.15s",
              background: "var(--surface)",
            }}
          >
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: layout === l.key ? "var(--fg)" : "var(--fg-3)" }}>
              {l.label}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 4 }}>{l.desc}</div>
            {layout === l.key && (
              <div style={{ marginTop: 6 }}>
                <Chip tone="accent" style={{ fontSize: 9 }}>当前</Chip>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Editor Section ─────────────────────────────── */

function EditorSection() {
  const defaultMode = useUIStore((s) => s.editorDefaultMode);
  const setDefaultMode = useUIStore((s) => s.setEditorDefaultMode);
  const autoSave = useUIStore((s) => s.editorAutoSave);
  const setAutoSave = useUIStore((s) => s.setEditorAutoSave);
  const fontSize = useUIStore((s) => s.editorFontSize);
  const setFontSize = useUIStore((s) => s.setEditorFontSize);

  return (
    <div style={{ maxWidth: 520 }}>
      <SectionHeader label="编辑器" />

      <SubLabel>默认模式</SubLabel>
      <div className="flex" style={{ gap: 8, marginBottom: 24 }}>
        {(["html", "markdown"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setDefaultMode(mode)}
            className={`btn btn-sm ${defaultMode === mode ? "btn-primary" : "btn-ghost"}`}
          >
            {mode.toUpperCase()}
          </button>
        ))}
      </div>

      <SubLabel>自动保存</SubLabel>
      <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
        <button
          onClick={() => setAutoSave(!autoSave)}
          style={{
            all: "unset",
            width: 36,
            height: 20,
            borderRadius: 10,
            background: autoSave ? "var(--accent)" : "var(--surface-2)",
            position: "relative",
            cursor: "pointer",
            transition: "background 0.2s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: autoSave ? 18 : 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "var(--fg)",
              transition: "left 0.2s",
            }}
          />
        </button>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--fg-2)" }}>
          {autoSave ? "已开启" : "已关闭"}
        </span>
      </div>

      <SubLabel>字体大小: {fontSize}px</SubLabel>
      <input
        type="range"
        min={10}
        max={20}
        value={fontSize}
        onChange={(e) => setFontSize(Number(e.target.value))}
        style={{ width: "100%", maxWidth: 300, accentColor: "var(--accent)" }}
      />
    </div>
  );
}

/* ── About Section ──────────────────────────────── */

function AboutSection() {
  const [version, setVersion] = useState("...");
  const [repo, setRepo] = useState(FALLBACK_REPO);

  useEffect(() => {
    api.get("/version").then((res) => {
      const data = unwrapApiData<VersionPayload>(res.data);
      setVersion(data?.version || "未知");
      setRepo(data?.repo || FALLBACK_REPO);
    }).catch(() => setVersion("未知"));
  }, []);

  return (
    <div style={{ maxWidth: 520 }}>
      <SectionHeader label="关于" />

      <FieldGroup label="版本">
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--fg)" }}>{version}</span>
      </FieldGroup>

      <FieldGroup label="项目地址">
        <a
          href={buildRepoUrl(repo)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
        >
          GitHub · {repo}
        </a>
      </FieldGroup>

      <div
        style={{
          marginTop: 48,
          padding: "16px 0",
          borderTop: "1px solid var(--border)",
          fontFamily: "var(--f-mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--fg-5)",
        }}
      >
        MBEditor &middot; 开源项目 &middot; MIT
      </div>
    </div>
  );
}

/* ── Shared sub-components ──────────────────────── */

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        className="caps"
        style={{
          fontSize: 10,
          letterSpacing: "0.15em",
          color: "var(--gold)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ height: 1, background: "var(--border)" }} />
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="caps"
      style={{
        fontSize: 9,
        letterSpacing: "0.12em",
        color: "var(--fg-4)",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        className="caps"
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          color: "var(--fg-4)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  all: "unset",
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "var(--f-mono)",
  fontSize: 13,
  color: "var(--fg-2)",
  padding: "8px 0",
  borderBottom: "1px solid var(--border)",
  transition: "border-color 0.15s",
};
