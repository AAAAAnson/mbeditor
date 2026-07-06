import { useEffect, useState } from "react";
import { toast } from "@/stores/toastStore";
import SectionHeader from "./SectionHeader";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Tag } from "@/components/ui/Tag";
import { IconSparkle, IconCheck, IconCode, IconLock, IconExternal } from "@/components/icons";
import {
  getLlmConfig,
  putLlmConfig,
  testLlmConnection,
  type LlmProvider,
  type LlmRedacted,
  type LlmConfigPatch,
  type LlmTestResult,
} from "./llmApi";

export interface AiPreset {
  label: string;
  provider: LlmProvider;
  base_url: string;
  model: string;
  rec?: boolean;
  /** 字母牌(预设行左侧),纯 UI 呈现。 */
  mono: string;
  /** 信任说明,纯 UI 呈现,不进数据契约。 */
  trust: string;
  /** 价格提示,纯 UI 呈现。 */
  price: string;
  /** 官方控制台/充值入口(域名级 https 官方域名,纯 UI 外链,不编造深路径)。 */
  console_url: string;
}

// 服务商一键预设:选卡即自动填 provider/base_url/model,用户只需补 key。
// 导出供连接 AI 向导(Task 7)复用,命名稳定。
// 信任说明 / 价格是纯 UI 呈现文案,绝不写死任何真实 key 或改 llm 数据契约。
export const AI_PRESETS: Record<string, AiPreset> = {
  deepseek: {
    label: "DeepSeek",
    provider: "openai_compat",
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    rec: true,
    mono: "D",
    trust: "国产、便宜、写中文顺,新手首选。",
    price: "约几分/篇",
    console_url: "https://platform.deepseek.com",
  },
  kimi: {
    label: "Kimi",
    provider: "openai_compat",
    base_url: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    mono: "K",
    trust: "月之暗面,长文理解强。",
    price: "约几分/篇",
    console_url: "https://platform.moonshot.cn",
  },
  qwen: {
    label: "通义千问",
    provider: "openai_compat",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    mono: "Q",
    trust: "阿里云,稳定、额度友好。",
    price: "约几分/篇",
    console_url: "https://bailian.console.aliyun.com",
  },
  claude: {
    label: "Claude",
    provider: "anthropic",
    base_url: "",
    model: "claude-opus-4-8",
    mono: "C",
    trust: "Anthropic,文笔细腻,价偏高。",
    price: "约几毛/篇",
    console_url: "https://console.anthropic.com",
  },
};

export default function AIEngineSection() {
  const [loaded, setLoaded] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [source, setSource] = useState<string>("env");

  const [provider, setProvider] = useState<LlmProvider>("openai_compat");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState(""); // 写后不回显:加载后恒为空,留空=保持不变

  const [advanced, setAdvanced] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null);

  const selectPreset = (preset: AiPreset) => {
    setProvider(preset.provider);
    setBaseUrl(preset.base_url);
    setModel(preset.model);
    setAdvanced(false);
  };

  const apply = (cfg: LlmRedacted) => {
    setProvider((cfg.provider as LlmProvider) || "openai_compat");
    setBaseUrl(cfg.base_url || "");
    setModel(cfg.model || "");
    setKeyConfigured(Boolean(cfg.keyConfigured));
    setSource(cfg.source || "env");
    setApiKey(""); // 密钥永不回填
  };

  useEffect(() => {
    getLlmConfig()
      .then(apply)
      .catch((err) => toast.error(err instanceof Error ? err.message : "读取 AI 引擎配置失败"))
      .finally(() => setLoaded(true));
  }, []);

  // 仅把实际填了的字段送进 patch(留空 = 保持不变)。
  const buildPatch = (): LlmConfigPatch => {
    const patch: LlmConfigPatch = { provider, model: model.trim() };
    if (provider === "openai_compat") {
      patch.base_url = baseUrl.trim();
    }
    if (apiKey) {
      patch.api_key = apiKey;
    }
    return patch;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cfg = await putLlmConfig(buildPatch());
      apply(cfg);
      setTestResult(null);
      toast.success("已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testLlmConnection(buildPatch());
      setTestResult(res);
      if (res.ok) {
        toast.success("连接成功");
      } else {
        toast.error(res.detail || "连接失败");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "测试失败");
    } finally {
      setTesting(false);
    }
  };

  const sourceLabel = source === "stored" ? "网页配置" : source === "env" ? "环境变量" : source;

  return (
    <div data-testid="ai-engine-section" style={{ maxWidth: 640 }}>
      <SectionHeader
        title="AI 引擎"
        eyebrow="写作 · AI 引擎"
        eyebrowIcon={<IconSparkle size={13} />}
        sub="自带模型 key(BYOK)。密钥写入本部署后端、写后不回显、不进浏览器存储、不进公开仓库。"
        subMaxWidth={640}
      />

      {/* ── 换一个服务商(预设行)── */}
      <div className="ss-card">
        <div className="ss-cardhd">
          <IconSparkle size={17} />
          <span className="ct">换一个服务商</span>
        </div>
        <div className="ss-cardbody">
          <div role="radiogroup" aria-label="选一个 AI">
            {Object.entries(AI_PRESETS).map(([id, preset]) => {
              const checked =
                !advanced &&
                provider === preset.provider &&
                baseUrl === preset.base_url &&
                model === preset.model;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={preset.label}
                  className={`ss-preset${checked ? " on" : ""}`}
                  onClick={() => selectPreset(preset)}
                >
                  <span className={`ss-ptile${checked ? " cur" : ""}`}>{preset.mono}</span>
                  <div className="ss-pmid">
                    <div className="ss-pname">
                      {preset.label}
                      {preset.rec && <span className="ss-moderec">推荐</span>}
                      {checked && (
                        <Tag tone="success" leading={<IconCheck size={11} />}>
                          使用中
                        </Tag>
                      )}
                    </div>
                    <div className="ss-ptrust">{preset.trust}</div>
                  </div>
                  <span className="ss-pprice">{preset.price}</span>
                </button>
              );
            })}

            {/* 「其它…」手动配置 → 同款预设行(触控 ≥44) */}
            <button
              type="button"
              role="radio"
              aria-checked={advanced}
              aria-label="其它…"
              className={`ss-preset${advanced ? " on" : ""}`}
              style={{ minHeight: 44 }}
              onClick={() => setAdvanced((v) => !v)}
            >
              <span className="ss-ptile">
                <IconCode size={18} />
              </span>
              <div className="ss-pmid">
                <div className="ss-pname">其它…</div>
                <div className="ss-ptrust">手动填 Provider / Base URL / Model(OpenAI 兼容)</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ── 连接配置(Base URL / Model / Key)── */}
      <div className="ss-card">
        <div className="ss-cardhd">
          <IconLock size={17} />
          <span className="ct">连接配置</span>
          <span className="cgrow" />
          <Tag data-testid="llm-source" tone="neutral">
            来源 {sourceLabel}
          </Tag>
        </div>
        <div className="ss-cardbody" style={{ display: "grid", gap: 16 }}>
          {advanced && (
            <Field label="Provider">
              <div className="mb-inputwrap">
                <select
                  aria-label="Provider"
                  className="mb-input"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as LlmProvider)}
                >
                  <option value="openai_compat">openai_compat</option>
                  <option value="anthropic">anthropic</option>
                </select>
              </div>
            </Field>
          )}

          {provider === "openai_compat" && (
            <Field label="Base URL">
              <Input
                aria-label="Base URL"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com/v1"
                lead={<IconExternal size={16} />}
              />
            </Field>
          )}

          <Field label="Model">
            <Input
              aria-label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === "anthropic" ? "claude-opus-4-8" : "deepseek-chat"}
            />
          </Field>

          <Field
            label="API Key"
            hint={keyConfigured && !apiKey ? "已配置 ••••（留空保持不变）" : undefined}
          >
            <Input
              aria-label="API Key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "anthropic" ? "留空走 env ANTHROPIC_API_KEY" : "sk-..."}
              lead={<IconLock size={16} />}
            />
          </Field>
        </div>
      </div>

      {testResult && (
        <div style={{ marginBottom: 16 }}>
          <Tag
            data-testid="llm-test-result"
            tone={testResult.ok ? "success" : "danger"}
            leading={testResult.ok ? <IconCheck size={12} /> : undefined}
          >
            {testResult.ok ? "可用 · " : "不可用 · "}
            {testResult.detail}
          </Tag>
        </div>
      )}

      <div className="ss-btnrow" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button className="btn btn-outline btn-sm" onClick={handleTest} disabled={!loaded || testing}>
          <IconExternal size={15} />
          {testing ? "测试中…" : "测试连接"}
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!loaded || saving}>
          <IconCheck size={15} />
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
