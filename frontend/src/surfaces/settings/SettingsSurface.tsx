import { useState, useEffect } from "react";
import { Tag, Segmented, Switch, Input, Textarea } from "@/components/ui";
import { useUIStore, type Theme, type Layout, type Density, type UIMode, type FontFamily } from "@/stores/uiStore";
import { toast } from "@/stores/toastStore";
import api from "@/lib/api";
import { useWeChatStore, type WeChatAccount } from "@/stores/wechatStore";
import { readLegacyBundle, applyLegacyBundle } from "@/lib/legacyImport";
import type { Route } from "@/types";
import ImageHostsSection from "./ImageHostsSection";
import WeChatBindWizard from "./WeChatBindWizard";
import { getCredentials, putCredential } from "./credentialsApi";
import AIEngineSection from "./AIEngineSection";
import BrandVoiceSection from "./BrandVoiceSection";
import SectionHeader from "./SectionHeader";
import BrandMark from "@/components/shared/BrandMark";
import {
  IconCheck,
  IconLeaf,
  IconWrench,
  IconKeyboard,
  IconColumns,
  IconSparkle,
  IconShield,
  IconChevronDown,
  IconMic,
  IconSend,
  IconImage,
  IconSettings,
  IconInfo,
  IconClock,
  IconWarn,
  IconLock,
  IconCode,
  IconEye,
  IconLink,
  IconKey,
} from "@/components/icons";
import { useIsMobile } from "@/hooks/useMediaQuery";
import type { ComponentType, CSSProperties } from "react";

type IconComponent = ComponentType<{ size?: number; className?: string }>;

type Section = "wechat" | "aiengine" | "voice" | "gateway" | "imagehost" | "appearance" | "editor" | "about";
type ActiveSection = Exclude<Section, "editor">;

type NavItem = {
  key: ActiveSection;
  label: string;
  Icon: IconComponent;
};

type NavGroup = {
  label: string;
  Icon: IconComponent;
  items: NavItem[];
};

const SECTION_KEYS: Section[] = [
  "wechat",
  "aiengine",
  "voice",
  "gateway",
  "imagehost",
  "appearance",
  "editor",
  "about",
];

function isSection(value: string | undefined): value is Section {
  return value != null && (SECTION_KEYS as string[]).includes(value);
}

// 设置收成 4 视觉分组(写作/发布/外观/关于)。叶子 Section key 不变 —— route.ts /
// App.tsx / ComposeSurface 的 deep-link（section=aiengine 等）零改、回归面最小。
const NAV_GROUPS: NavGroup[] = [
  { label: "写作", items: [
    { key: "aiengine", label: "AI 引擎", Icon: IconSparkle },
    { key: "voice", label: "音色档案", Icon: IconMic },
  ], Icon: IconSparkle },
  { label: "发布", items: [
    { key: "wechat", label: "公众号", Icon: IconSend },
    { key: "gateway", label: "发布服务器", Icon: IconShield },
    { key: "imagehost", label: "图床", Icon: IconImage },
  ], Icon: IconSend },
  { label: "外观", items: [
    // 叶子文案「外观与模式」更贴抽屉内容(并入了编辑器默认/字体/密度);
    // 🔴 key=appearance 不变 —— deep-link / normalizeSection 落点零改。
    { key: "appearance", label: "外观与模式", Icon: IconSettings },
  ], Icon: IconSettings },
  { label: "关于", items: [
    { key: "about", label: "关于", Icon: IconInfo },
  ], Icon: IconInfo },
];

// 旧 editor section 的控件已并入「外观」抽屉;deep-link section=editor 归一化到 appearance。
function normalizeSection(section: Section): ActiveSection {
  return section === "editor" ? "appearance" : section;
}

// 🔴 仅 2 套(light/dark),与 uiStore Theme 联合类型一致 —— 对齐设计稿渐变色块,
// 但绝不因设计稿里的 4 套示意而加档。bg=色块渐变,dot=右下强调圆点。
const THEMES: { key: Theme; label: string; bg: string; dot: string }[] = [
  { key: "light", label: "暖光", bg: "linear-gradient(135deg,#fbf6ee 60%,#fbdccf)", dot: "#e8553a" },
  { key: "dark", label: "暖夜", bg: "linear-gradient(135deg,#2c241c 60%,#3d3225)", dot: "#ec6f4d" },
];

const LAYOUTS: { key: Layout; label: string; desc: string }[] = [
  { key: "focus", label: "单栏", desc: "只看编辑区" },
  { key: "split", label: "双栏", desc: "编辑区 + 预览区" },
  { key: "triptych", label: "三栏", desc: "大纲 + 编辑区 + 预览区" },
];

const FONTS: { key: FontFamily; label: string; sample: string; family: string }[] = [
  { key: "rounded", label: "圆润", sample: "Aa 早安", family: "var(--f-sans)" },
  { key: "serif", label: "人文衬线", sample: "Aa 早安", family: "var(--f-display)" },
  { key: "system", label: "系统", sample: "Aa 早安", family: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif' },
];

const DENSITIES: { key: Density; label: string; desc: string }[] = [
  { key: "compact", label: "紧凑", desc: "信息更密，列表行高更小" },
  { key: "comfy", label: "舒适", desc: "默认节奏，便于日常编辑" },
  { key: "spacious", label: "宽松", desc: "更大留白，便于浏览" },
];

const UI_MODES: { key: UIMode; label: string; Icon: IconComponent; desc: string }[] = [
  { key: "simple", label: "简单模式", Icon: IconLeaf, desc: "AI 写作专注流，所见即所得，适合大多数人" },
  { key: "pro", label: "专业模式", Icon: IconWrench, desc: "解锁代码抽屉、三栏、SVG，给想精修的人" },
];

// 专业模式解锁预告 —— 6 项(设计稿 PRO_UNLOCKS)。前 4 项 label 为既有可发现性测试断言,逐字保留。
const PRO_FEATURES: { Icon: IconComponent; label: string }[] = [
  { Icon: IconKeyboard, label: "代码抽屉（HTML / CSS / JS）" },
  { Icon: IconColumns, label: "三栏编辑 + 大纲" },
  { Icon: IconSparkle, label: "SVG 交互动效编辑" },
  { Icon: IconShield, label: "公众号兼容性校验" },
  { Icon: IconEye, label: "手机预览 + 缩放拖拽" },
  { Icon: IconImage, label: "三段视图自由切换" },
];

interface Props {
  go?: (route: Route, params?: Record<string, string>) => void;
  /** Deep-link target section (from /settings?section=...). */
  initialSection?: string;
}

type VersionPayload = {
  version?: string;
  repo?: string;
};

type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
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

function renderSettingsSection(active: ActiveSection) {
  return (
    <>
      {active === "wechat" && <WeChatSection />}
      {active === "aiengine" && <AIEngineSection />}
      {active === "voice" && <BrandVoiceSection />}
      {active === "gateway" && <GatewaySection />}
      {active === "imagehost" && <ImageHostsSection />}
      {active === "appearance" && <AppearanceSection />}
      {active === "about" && <AboutSection />}
    </>
  );
}

export function SettingsSurface({ initialSection }: Props = {}) {
  const initialActive = normalizeSection(isSection(initialSection) ? initialSection : "wechat");
  const [section, setSection] = useState<ActiveSection>(initialActive);
  const [openSection, setOpenSection] = useState<ActiveSection | null>(initialActive);
  const isMobile = useIsMobile();

  return (
    <div
      data-testid="settings-surface"
      style={{
        height: "100%",
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--ink)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {isMobile ? (
        <div
          data-testid="settings-mobile-accordion"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "22px 18px 28px",
          }}
        >
          <h1 className="set-title" style={{ margin: "0 0 18px" }}>
            设置
          </h1>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 18 }}>
              <div className="set-accglabel">{group.label}</div>
              {group.items.map((item) => {
                const expanded = openSection === item.key;
                return (
                  <div
                    key={item.key}
                    style={{
                      border: "1px solid var(--line)",
                      borderRadius: "var(--r-lg)",
                      background: "var(--surface)",
                      overflow: "hidden",
                      boxShadow: "var(--sh-xs)",
                      marginTop: 10,
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => {
                        setOpenSection(expanded ? null : item.key);
                        setSection(item.key);
                      }}
                      style={{
                        all: "unset",
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        minHeight: 54,
                        padding: "0 16px",
                        background: expanded ? "var(--orange-50)" : "transparent",
                        color: expanded ? "var(--orange-700)" : "var(--ink-strong)",
                        cursor: "pointer",
                        fontFamily: "var(--f-sans)",
                        fontSize: 15.5,
                        fontWeight: 600,
                        textAlign: "left",
                      }}
                    >
                      <item.Icon size={19} />
                      {item.label}
                      <span style={{ flex: 1 }} />
                      <span
                        style={{
                          display: "flex",
                          color: expanded ? "var(--orange-600)" : "var(--ink-faint)",
                          transform: expanded ? "rotate(180deg)" : "none",
                          transition: "transform 0.18s, color 0.18s",
                        }}
                      >
                        <IconChevronDown size={18} />
                      </span>
                    </button>
                    {expanded && (
                      <div
                        className="mb-rise"
                        style={{
                          padding: "18px 16px 22px",
                          borderTop: "1px solid var(--line)",
                          background: "var(--bg)",
                        }}
                      >
                        {renderSettingsSection(item.key)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <nav
            data-testid="settings-nav"
            style={{
              width: 256,
              flex: "0 0 256px",
              borderRight: "1px solid var(--line)",
              background: "var(--surface)",
              overflowY: "auto",
              padding: "24px 16px 40px",
              boxSizing: "border-box",
            }}
          >
            <h1 className="set-title" style={{ padding: "0 12px", margin: "0 0 20px" }}>
              设置
            </h1>
            {NAV_GROUPS.map((group) => (
              <div key={group.label} style={{ marginBottom: 22 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.6,
                    textTransform: "uppercase",
                    color: "var(--ink-faint)",
                    padding: "0 12px",
                    marginBottom: 7,
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <group.Icon size={13} />
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const active = section === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSection(item.key)}
                      className={active ? "settings-navitem is-active" : "settings-navitem"}
                    >
                      <item.Icon size={18} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
            <div
              data-testid="settings-content-inner"
              style={{
                maxWidth: 760,
                margin: "0 auto",
                padding: "36px 44px 80px",
                boxSizing: "border-box",
              }}
            >
              {renderSettingsSection(section)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsSurface;

/* ── WeChat Section ─────────────────────────────── */

function WeChatSection() {
  const accounts = useWeChatStore((s) => s.accounts);
  const activeAccountId = useWeChatStore((s) => s.activeAccountId);
  const addAccount = useWeChatStore((s) => s.addAccount);
  const updateAccount = useWeChatStore((s) => s.updateAccount);
  const removeAccount = useWeChatStore((s) => s.removeAccount);
  const setActive = useWeChatStore((s) => s.setActive);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [configured, setConfigured] = useState<string[]>([]);

  const refreshConfigured = async () => {
    try {
      setConfigured(await getCredentials());
    } catch {
      /* non-fatal: marker just won't show */
    }
  };

  useEffect(() => {
    void refreshConfigured();
  }, []);

  const beginAdd = () => setEditingId("__new");
  const beginEdit = (a: WeChatAccount) => setEditingId(a.id);
  const cancel = () => setEditingId(null);

  const editingAccount =
    editingId && editingId !== "__new" ? accounts.find((a) => a.id === editingId) : undefined;

  const handleBound = async (payload: { name: string; appid: string; appsecret: string }) => {
    if (editingId === "__new") {
      addAccount(payload);
    } else if (editingId) {
      updateAccount(editingId, payload);
    }
    // 只有真填了新密钥才上传服务器;编辑已持久化的号、AppSecret 留空时保留服务器既有密钥(不以 "" 清除)。
    if (payload.appsecret) {
      try {
        await putCredential(payload.appid, payload.appsecret);
        await refreshConfigured();
      } catch (err) {
        toast.error(getErrorMessage(err, "密钥保存到服务器失败"));
      }
    }
    setEditingId(null);
    toast.success("已绑定");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bundle = await readLegacyBundle(file);
      applyLegacyBundle(bundle);
      toast.success(`已导入 ${bundle.articles.length} 篇文章，${bundle.mbdocs.length} 个 MBDoc`);
    } catch (err) {
      toast.error(getErrorMessage(err, "导入失败"));
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <SectionHeader
        title="公众号绑定"
        eyebrow="发布 · 公众号"
        sub="选一个当前要发布的公众号。复制到公众号不需要绑号；只有发到草稿箱才需要在这里绑定并填密钥。"
      />

      <div style={{ fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 16 }}>
        已保存的公众号其 AppSecret 存在服务器（写后不回显），刷新页面无需重输；未保存的号 AppSecret 仅在当前会话内存。
      </div>

      <div className="ss-btnrow" style={{ gap: 8, marginBottom: 20 }}>
        <button className="btn btn-primary btn-sm" onClick={beginAdd}>添加公众号</button>
        <label className="btn btn-outline btn-sm" style={{ cursor: "pointer", display: "inline-flex" }}>
          导入旧数据
          <input type="file" accept="application/json" onChange={handleImport} style={{ display: "none" }} />
        </label>
      </div>

      {accounts.length === 0 ? (
        <div
          style={{
            padding: "24px 16px",
            border: "1px dashed var(--line)",
            borderRadius: "var(--r-md)",
            textAlign: "center",
            color: "var(--ink-soft)",
            fontSize: 12,
            marginBottom: 20,
          }}
        >
          还没有公众号账号，点击「添加公众号」开始配置。
        </div>
      ) : (
        <div className="ss-card">
          <div className="ss-cardhd">
            <IconSend size={18} />
            <span className="ct">我的公众号</span>
            <span className="cgrow" />
            <Tag tone="neutral">{accounts.length} 个</Tag>
          </div>
          <div className="ss-cardbody">
            {accounts.map((a) => {
              const active = activeAccountId === a.id;
              return (
                <div
                  key={a.id}
                  role="radio"
                  aria-checked={active}
                  aria-label={`选择 ${a.name || a.appid}`}
                  tabIndex={0}
                  className={`ss-acct${active ? " on" : ""}`}
                  onClick={() => setActive(a.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActive(a.id);
                    }
                  }}
                >
                  <span className="ss-radio" aria-hidden="true" />
                  <div className="ss-acctmid">
                    <div className="ss-acctname">{a.name || "(未命名)"}</div>
                    <div className="ss-acctid" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>{a.appid}</span>
                      {configured.includes(a.appid) ? (
                        <Tag tone="success" leading={<IconCheck size={12} />}>
                          密钥已保存
                        </Tag>
                      ) : a.appsecret ? (
                        <Tag tone="warning" leading={<IconClock size={12} />}>会话临时</Tag>
                      ) : (
                        <Tag tone="neutral" leading={<IconWarn size={12} />}>未配置密钥</Tag>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      beginEdit(a);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async (e) => {
                      e.stopPropagation();
                      removeAccount(a.id);
                      try {
                        await putCredential(a.appid, "");
                        await refreshConfigured();
                      } catch {
                        /* non-fatal */
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editingId && (
        <WeChatBindWizard
          account={editingAccount}
          configured={configured}
          onBound={handleBound}
          onCancel={cancel}
        />
      )}
    </div>
  );
}

/* ── Gateway Section ────────────────────────────── */

type GatewayEffective = {
  transport: string;
  enabled: boolean;
  base: string;
  tokenConfigured: boolean;
  caConfigured: boolean;
  caFingerprint: string | null;
  source: string;
};

type GatewayTestResult = {
  reachable: boolean;
  tls: string;
  token: string;
  detail: string;
};

const SOURCE_LABELS: Record<string, string> = {
  stored: "网页配置",
  env: "环境变量",
  direct: "直连",
};

function GatewaySection() {
  const [loaded, setLoaded] = useState(false);
  const [effective, setEffective] = useState<GatewayEffective | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [base, setBase] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [pemInput, setPemInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<GatewayTestResult | null>(null);

  const applyEffective = (data: GatewayEffective) => {
    setEffective(data);
    setEnabled(Boolean(data.enabled) && data.transport === "https-gateway");
    setBase(data.base || "");
    // Secrets are write-only: never prefill, leave blank = keep existing.
    setTokenInput("");
    setPemInput("");
  };

  useEffect(() => {
    api
      .get("/settings/gateway")
      .then((res) => {
        const data = unwrapApiData<GatewayEffective>(res.data);
        if (data) applyEffective(data);
      })
      .catch((err) => toast.error(getErrorMessage(err, "读取网关配置失败")))
      .finally(() => setLoaded(true));
  }, []);

  const handleUploadCert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setPemInput(text);
      toast.success("已读取证书内容");
    } catch (err) {
      toast.error(getErrorMessage(err, "读取证书失败"));
    } finally {
      e.target.value = "";
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post("/settings/gateway/test", {
        base: base.trim(),
        // Blank input falls back to stored value on the backend.
        token: tokenInput || null,
        caPem: pemInput || null,
      });
      const data = unwrapApiData<GatewayTestResult>(res.data);
      if (data) {
        setTestResult(data);
        if (data.reachable && data.tls === "ok") {
          toast.success("网关可达");
        } else {
          toast.error(data.detail || "测试未通过");
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "测试失败"));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put("/settings/gateway", {
        enabled,
        transport: enabled ? "https-gateway" : "direct",
        base: base.trim(),
        token: tokenInput || null,
        caPem: pemInput || null,
      });
      const data = unwrapApiData<GatewayEffective>(res.data);
      if (data) applyEffective(data);
      setTestResult(null);
      toast.success("已保存");
    } catch (err) {
      toast.error(getErrorMessage(err, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel = effective ? SOURCE_LABELS[effective.source] ?? effective.source : "加载中…";

  const testOk = testResult ? testResult.reachable && testResult.tls === "ok" : false;

  return (
    <div data-testid="gateway-section" style={{ maxWidth: 560 }}>
      <SectionHeader
        title="发布服务器 / 网关"
        eyebrow="发布 · 发布服务器"
        eyebrowIcon={<IconShield size={13} />}
        sub="公众号 API 要求出口 IP 在白名单内。如果本机出口 IP 不便加白名单，可经一台固定 IP 的中转网关转发。令牌与证书只写入本部署的后端，不回显、不进浏览器存储、不进公开仓库。"
      />

      <div className="ss-card">
        <div className="ss-cardbody">
          {/* 开关进卡:第一条 .ss-row(enabled 读写语义不变,只是从卡外裸排移入卡内) */}
          <div className="ss-row">
            <div className="ss-rowmain">
              <div className="ss-rowlabel">启用发布服务器</div>
              <div className="ss-rowdesc">关闭时走默认直连；开启后所有发布请求经你的网关。</div>
            </div>
            <div className="ss-rowctrl">
              <Switch aria-label="经网关中转" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          {/* 字段常驻:关闭时变灰(opacity/pointerEvents),不再条件移除 */}
          <div className="ss-row" style={{ opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? "auto" : "none" }}>
            <div className="ss-rowmain">
              <div className="ss-rowlabel">网关地址</div>
              <div className="ss-rowdesc">你的中转服务部署地址。</div>
            </div>
            <div className="ss-rowctrl" style={{ flex: 1, width: "100%" }}>
              <Input
                aria-label="网关地址"
                wrapClassName="ss-rowinput"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="https://gateway.example.com:8443"
                lead={<IconLink size={16} />}
              />
            </div>
          </div>

          <div className="ss-row" style={{ opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? "auto" : "none" }}>
            <div className="ss-rowmain">
              <div className="ss-rowlabel">令牌</div>
              <div className="ss-rowdesc">写后不回显（write-only）；留空保持不变。</div>
            </div>
            <div className="ss-rowctrl" style={{ flex: 1, width: "100%" }}>
              <Input
                aria-label="令牌"
                wrapClassName="ss-rowinput"
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={effective?.tokenConfigured ? "已配置 ••••（留空保持不变）" : "Bearer 令牌"}
                lead={<IconKey size={16} />}
              />
            </div>
          </div>

          <div className="ss-row" style={{ opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? "auto" : "none" }}>
            <div className="ss-rowmain">
              <div className="ss-rowlabel">证书 PEM</div>
              <div className="ss-rowdesc">网关用自签证书时上传 PEM。</div>
              {effective?.caConfigured && !pemInput && (
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 6, fontFamily: "var(--f-mono)" }}>
                  已配置 · {effective.caFingerprint || "指纹未知"}（留空保持不变）
                </div>
              )}
            </div>
            <div className="ss-rowctrl" style={{ flex: 1, width: "100%", flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <Textarea
                aria-label="证书 PEM"
                value={pemInput}
                onChange={(e) => setPemInput(e.target.value)}
                placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                rows={5}
                style={{ resize: "vertical", lineHeight: 1.5 }}
              />
              <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", display: "inline-flex", alignSelf: "flex-start" }}>
                上传 .crt
                <input
                  type="file"
                  accept=".crt,.pem,.cer,application/x-pem-file,application/x-x509-ca-cert"
                  onChange={handleUploadCert}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 卡外:来源标 + 测试连接/保存(保留 disabled 条件) */}
      <div className="ss-btnrow" style={{ gap: 8, marginBottom: 16 }}>
        <span className="ss-badge env">
          <IconShield size={12} /> 来源 {sourceLabel}
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="btn btn-outline btn-sm"
          onClick={handleTest}
          disabled={!loaded || testing || !enabled}
        >
          {testing ? "测试中…" : "测试连接"}
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!loaded || saving}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>

      {testResult && (
        <div
          data-testid="gateway-test-result"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 14px",
            borderRadius: "var(--r-md)",
            borderLeft: `3px solid var(${testOk ? "--success" : "--danger"})`,
            background: `var(${testOk ? "--success-soft" : "--danger-soft"})`,
            color: `var(${testOk ? "--success-ink" : "--danger-ink"})`,
            marginBottom: 16,
          }}
        >
          <span style={{ flex: "none", display: "flex", paddingTop: 1 }}>
            {testOk ? <IconCheck size={16} /> : <IconWarn size={16} />}
          </span>
          <div
            style={{
              display: "grid",
              gap: 4,
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              minWidth: 0,
            }}
          >
            <div>可达：{testResult.reachable ? "是" : "否"}</div>
            <div>TLS：{testResult.tls}</div>
            <div>令牌：{testResult.token}</div>
            <div style={{ opacity: 0.85 }}>{testResult.detail}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Appearance Section ─────────────────────────── */

/** 设置卡片骨架:卡头「图标 + 标题」(可选右侧 trailing) + body。 */
function SettingsCard({
  icon,
  title,
  trailing,
  children,
  style,
}: {
  icon: React.ReactNode;
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="ss-card" style={style}>
      <div className="ss-cardhd">
        {icon}
        <span className="ct">{title}</span>
        {trailing != null && <span className="cgrow" />}
        {trailing}
      </div>
      <div className="ss-cardbody">{children}</div>
    </div>
  );
}

/** 界面模式选中卡(右上对勾徽标 + 40×40 图标 + 描边「推荐」胶囊)。 */
function ModeCard({
  on,
  Icon,
  name,
  rec,
  desc,
  onClick,
}: {
  on: boolean;
  Icon: IconComponent;
  name: string;
  rec?: boolean;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`ss-mode${on ? " on" : ""}`} onClick={onClick} aria-pressed={on}>
      <span className="ss-modechk">
        <IconCheck size={14} />
      </span>
      <div className="ss-modetop">
        <span className="ss-modeico">
          <Icon size={20} />
        </span>
        <div>
          <span className="ss-modenm">{name}</span>
          {rec && <span className="ss-moderec">推荐</span>}
        </div>
      </div>
      <div className="ss-modedesc">{desc}</div>
    </button>
  );
}

function AppearanceSection() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const density = useUIStore((s) => s.density);
  const setDensity = useUIStore((s) => s.setDensity);
  const layout = useUIStore((s) => s.layout);
  const setLayout = useUIStore((s) => s.setLayout);
  const uiMode = useUIStore((s) => s.uiMode);
  const setUiMode = useUIStore((s) => s.setUiMode);
  const fontFamily = useUIStore((s) => s.fontFamily);
  const setFontFamily = useUIStore((s) => s.setFontFamily);

  const proUnlocked = uiMode === "pro";

  return (
    <div style={{ maxWidth: 560 }}>
      <SectionHeader
        title="外观与模式"
        eyebrow="外观"
        eyebrowIcon={<IconSettings size={13} />}
        sub="挑一套看着舒服的样子。界面模式决定露出多少功能，默认简单，把代码和复杂控件都收起来。"
      />

      {/* ── 界面模式 ── */}
      <SettingsCard icon={<IconColumns size={17} />} title="界面模式">
        <div className="ss-modes">
          {UI_MODES.map((m) => (
            <ModeCard
              key={m.key}
              on={uiMode === m.key}
              Icon={m.Icon}
              name={m.label}
              rec={m.key === "simple"}
              desc={m.desc}
              onClick={() => setUiMode(m.key)}
            />
          ))}
        </div>

        {/* 专业模式能解锁这些 — 6 项预告盒 + 安抚句 */}
        <div className="ss-unlock">
          <div className="ss-unlockhd">
            <IconWrench size={15} /> 专业模式能解锁这些
          </div>
          <div className="ss-unlockgrid">
            {PRO_FEATURES.map((f) => (
              <div className="ss-unlockitem" key={f.label}>
                <span className="uk">
                  <f.Icon size={14} />
                </span>
                {f.label}
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-soft)",
              marginTop: 13,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <IconLock size={12} /> 切回简单模式只是「收起」，你的布局偏好会留着，不会丢。
          </div>
        </div>
      </SettingsCard>

      {/* ── 主题(2 套:暖光/暖夜)── */}
      <SettingsCard icon={<IconSettings size={17} />} title="主题">
        <div className="ss-opts">
          {THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`ss-swatch${theme === t.key ? " on" : ""}`}
              onClick={() => setTheme(t.key)}
              aria-pressed={theme === t.key}
              aria-label={t.label}
            >
              <span className="ss-swatchbox" style={{ background: t.bg }}>
                <span
                  style={{
                    position: "absolute",
                    right: 6,
                    bottom: 6,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: t.dot,
                  }}
                />
              </span>
              <span className="ss-swatchlab">{t.label}</span>
            </button>
          ))}
        </div>
      </SettingsCard>

      {/* ── 字体 + 密度 ── */}
      <div className="ss-card">
        <div className="ss-cardbody">
          <div className="ss-row">
            <div className="ss-rowmain">
              <div className="ss-rowlabel">字体</div>
              <div className="ss-rowdesc">界面与正文的字体气质。</div>
            </div>
            <div className="ss-rowctrl">
              <div className="ss-opts">
                {FONTS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`ss-pillopt${fontFamily === f.key ? " on" : ""}`}
                    onClick={() => setFontFamily(f.key)}
                    aria-pressed={fontFamily === f.key}
                    aria-label={f.label}
                  >
                    <span style={{ fontFamily: f.family }}>{f.sample}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="ss-row">
            <div className="ss-rowmain">
              <div className="ss-rowlabel">密度</div>
              <div className="ss-rowdesc">控件与间距的松紧。</div>
            </div>
            <div className="ss-rowctrl">
              <Segmented
                ariaLabel="界面密度"
                roleType="buttons"
                value={density}
                onChange={setDensity}
                options={DENSITIES.map((d) => ({ value: d.key, label: d.label }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 编辑器布局(仅专业可用,简单模式视觉降级)── */}
      <SettingsCard
        icon={<IconColumns size={17} />}
        title="编辑器布局"
        trailing={
          !proUnlocked ? (
            <Tag tone="neutral" leading={<IconLock size={11} />}>
              专业模式可用
            </Tag>
          ) : undefined
        }
        style={{ opacity: proUnlocked ? 1 : 0.55 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 11,
            pointerEvents: proUnlocked ? "auto" : "none",
          }}
        >
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              type="button"
              className={`ss-mode${layout === l.key ? " on" : ""}`}
              style={{ padding: 14 }}
              onClick={() => setLayout(l.key)}
              aria-pressed={layout === l.key}
              disabled={!proUnlocked}
            >
              <span className="ss-modechk">
                <IconCheck size={13} />
              </span>
              <div className="ss-modetop" style={{ marginBottom: 8 }}>
                <span className="ss-modeico" style={{ width: 34, height: 34 }}>
                  <IconColumns size={17} />
                </span>
                <span className="ss-modenm" style={{ fontSize: 15 }}>
                  {l.label}
                </span>
              </div>
              <div className="ss-modedesc" style={{ fontSize: 12 }}>
                {l.desc}
              </div>
            </button>
          ))}
        </div>
      </SettingsCard>

      {/* 编辑器默认行为并入「外观」抽屉(spec §8) */}
      <EditorSection />
    </div>
  );
}

/* ── Editor Section(并入外观抽屉,见 AppearanceSection)──── */

function EditorSection() {
  const defaultMode = useUIStore((s) => s.editorDefaultMode);
  const setDefaultMode = useUIStore((s) => s.setEditorDefaultMode);
  const autoSave = useUIStore((s) => s.editorAutoSave);
  const setAutoSave = useUIStore((s) => s.setEditorAutoSave);
  const fontSize = useUIStore((s) => s.editorFontSize);
  const setFontSize = useUIStore((s) => s.setEditorFontSize);

  return (
    <SettingsCard icon={<IconCode size={17} />} title="编辑器默认行为">
      <div className="ss-row">
        <div className="ss-rowmain">
          <div className="ss-rowlabel">默认编辑格式</div>
          <div className="ss-rowdesc">新建文档时用哪种源码格式。</div>
        </div>
        <div className="ss-rowctrl">
          <Segmented
            ariaLabel="默认编辑格式"
            roleType="buttons"
            value={defaultMode}
            onChange={setDefaultMode}
            options={[
              { value: "html", label: "HTML" },
              { value: "markdown", label: "Markdown" },
            ]}
          />
        </div>
      </div>

      <div className="ss-row">
        <div className="ss-rowmain">
          <div className="ss-rowlabel">自动保存</div>
          <div className="ss-rowdesc">编辑时自动存草稿，刷新不丢。</div>
        </div>
        <div className="ss-rowctrl">
          <Switch checked={autoSave} onCheckedChange={setAutoSave} aria-label="自动保存" />
        </div>
      </div>

      <div className="ss-row">
        <div className="ss-rowmain">
          <div className="ss-rowlabel">编辑器字号</div>
          <div className="ss-rowdesc">源码区文字大小。</div>
        </div>
        <div className="ss-rowctrl" style={{ width: 220 }}>
          <div className="ss-slider" style={{ width: "100%" }}>
            <input
              type="range"
              min={10}
              max={20}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              aria-label="编辑器字号"
            />
            <span className="ss-slidernum">{fontSize}px</span>
          </div>
        </div>
      </div>
    </SettingsCard>
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
    <div style={{ maxWidth: 560 }}>
      <SectionHeader
        eyebrow="关于"
        eyebrowIcon={<IconInfo size={13} />}
        title="关于 MBEditor"
        sub="一个会写会排版的小帮手 —— 动动嘴，排版就好了。"
      />

      {/* 卡1:品牌标识 + 真实版本号中性 chip(无更新检测逻辑,绝不用「已是最新」假态) */}
      <div className="ss-card">
        <div className="ss-cardbody" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <BrandMark size={56} radius={24} />
          <div>
            <div style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 22, color: "var(--ink-strong)" }}>
              MBEditor
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 3 }}>微信公众号写作 · 排版小帮手</div>
          </div>
          <span style={{ flex: 1 }} />
          <span className="ss-badge none">v{version}</span>
        </div>
      </div>

      {/* 卡2:版本 / 项目地址 / 开源许可(真实数据 + 真实链接) */}
      <div className="ss-card">
        <div className="ss-cardbody">
          <div className="ss-about-rows">
            <div className="ss-about-row">
              <span className="ss-about-k">版本</span>
              <span className="ss-about-v">{version}</span>
            </div>
            <div className="ss-about-row">
              <span className="ss-about-k">项目地址</span>
              <a
                className="ss-about-v ss-about-link"
                href={buildRepoUrl(repo)}
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/{repo}
              </a>
            </div>
            <div className="ss-about-row">
              <span className="ss-about-k">开源 / 许可</span>
              <span className="ss-about-v" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                MIT 许可证
                <a
                  className="ss-about-link"
                  href={`${buildRepoUrl(repo)}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看 LICENSE
                </a>
              </span>
            </div>
          </div>
        </div>
      </div>

      <p
        style={{
          fontSize: 12.5,
          color: "var(--ink-soft)",
          display: "flex",
          alignItems: "center",
          gap: 7,
          margin: "4px 2px",
        }}
      >
        <IconLock size={13} /> 开源免费 · 无账号体系 · 内容与密钥不经平台服务器。
      </p>
    </div>
  );
}
