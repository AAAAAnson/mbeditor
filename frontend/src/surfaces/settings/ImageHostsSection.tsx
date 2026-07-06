import { useState } from "react";
import { getEngine, listEngines } from "@/lib/image-hosts/registry";
import { useImageHostStore } from "@/stores/imageHostStore";
import type { ImageHostId } from "@/lib/image-hosts/types";
import { Field, Input } from "@/components/ui";
import { IconImage, IconCheck } from "@/components/icons";
import SectionHeader from "./SectionHeader";

// 每个图床的说明文案 + 默认/推荐 chip(引擎注册表只带 id/label,描述在此本地化)。
const HOST_META: Record<ImageHostId, { desc: string; chip?: string }> = {
  default: { desc: "默认。复制 / 草稿时本地图自动上传到当前公众号素材库。", chip: "默认" },
  github: { desc: "用 GitHub 仓库存图,可经 jsDelivr CDN 加速。", chip: "推荐" },
  aliyun: { desc: "阿里云对象存储,适合大量图片。" },
  "tencent-cos": { desc: "腾讯云对象存储,适合大量图片。" },
  "cloudflare-r2": { desc: "Cloudflare R2,出网零流量费。" },
};

export default function ImageHostsSection() {
  const activeHostId = useImageHostStore((s) => s.activeHostId);
  const setActiveHost = useImageHostStore((s) => s.setActiveHost);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const activeConfig = useImageHostStore((s) => s.configs[s.activeHostId as keyof typeof s.configs]);
  const activeEngine = getEngine(activeHostId);
  const canTest = activeEngine.isConfigured(activeConfig as any);

  async function runTestUpload() {
    setTesting(true); setTestResult(null);
    try {
      // 1×1 transparent PNG
      const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
      const file = new File([png], "test.png", { type: "image/png" });
      const { uploadWithActive } = await import("@/lib/image-hosts/dispatch");
      const res = await uploadWithActive(file);
      setTestResult(res.url);
    } catch (err) {
      setTestResult(err instanceof Error ? `错误: ${err.message}` : "错误");
    } finally { setTesting(false); }
  }

  return (
    <div data-testid="imagehost-section" style={{ maxWidth: 640 }}>
      <SectionHeader
        title="图床"
        eyebrow="发布 · 图床"
        eyebrowIcon={<IconImage size={13} />}
        sub="文章里的本地图片在发布前会先上传到图床。默认使用公众号素材库，够用就不用改。"
      />

      <div className="ss-card">
        <div className="ss-cardhd">
          <IconImage size={17} />
          <span className="ct">选择图床</span>
        </div>
        <div className="ss-cardbody" role="radiogroup" aria-label="图床引擎">
          {listEngines().map((engine) => {
            const checked = activeHostId === engine.id;
            const meta = HOST_META[engine.id];
            return (
              <button
                key={engine.id}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={engine.label}
                className={`ss-preset${checked ? " on" : ""}`}
                onClick={() => setActiveHost(engine.id as ImageHostId)}
              >
                <span className={`ss-ptile${checked ? " cur" : ""}`}>
                  <IconImage size={18} />
                </span>
                <div className="ss-pmid">
                  <div className="ss-pname">
                    {engine.label}
                    {meta?.chip && <span className="ss-moderec">{meta.chip}</span>}
                  </div>
                  <div className="ss-ptrust">{meta?.desc}</div>
                </div>
                {checked && (
                  <span style={{ flex: "none", display: "flex", color: "var(--orange-600)" }}>
                    <IconCheck size={18} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div data-testid="imagehost-config-form">
        {activeHostId === "default" && (
          <div data-testid="imagehost-default-info" style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            当前使用「公众号素材库」：图片会通过后端代理上传到当前激活的公众号 AppID 对应的素材库，并返回 mmbiz.qpic.cn 链接。
            如需自托管，请在上方切换到其他图床并填入凭据。
          </div>
        )}
        {activeHostId === "github" && <GithubForm />}
        {activeHostId === "aliyun" && <AliyunForm />}
        {activeHostId === "tencent-cos" && <TencentCosForm />}
        {activeHostId === "cloudflare-r2" && <CloudflareR2Form />}
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="btn btn-primary btn-sm" disabled={!canTest || testing} onClick={runTestUpload}>
          {testing ? "上传中..." : "测试上传"}
        </button>
        {testResult && <div data-testid="imagehost-test-result" style={{ marginTop: 12, fontFamily: "var(--f-mono)", fontSize: 12 }}>{testResult}</div>}
      </div>

      <div data-testid="imagehost-security-note" style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.6 }}>
        敏感令牌与访问密钥仅保存在内存中，不写入 localStorage。仓库、存储桶、地域、域名等设置会留到下次会话。
      </div>
    </div>
  );
}

function CredCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ss-card mb-rise" style={{ marginTop: 18 }}>
      <div className="ss-cardhd">
        <IconImage size={17} />
        <span className="ct">{title}</span>
      </div>
      <div className="ss-cardbody" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function GithubForm() {
  const cfg = useImageHostStore((s) => s.configs.github);
  const setConfig = useImageHostStore((s) => s.setConfig);
  const draft = {
    repo: cfg?.repo ?? "",
    branch: cfg?.branch ?? "main",
    accessToken: cfg?.accessToken ?? "",
    useCDN: cfg?.useCDN ?? false,
  };
  function commit(patch: Partial<typeof draft>) {
    setConfig("github", { ...draft, ...patch });
  }
  return (
    <CredCard title="GitHub · 凭据">
      <Field label="仓库" hint="owner/repo">
        <Input aria-label="仓库" defaultValue={draft.repo} onBlur={(e) => commit({ repo: e.target.value })} placeholder="owner/repo" />
      </Field>
      <Field label="分支">
        <Input aria-label="分支" defaultValue={draft.branch} onBlur={(e) => commit({ branch: e.target.value })} />
      </Field>
      <Field label="Access Token" hint="写后不回显">
        <Input aria-label="Access Token" type="password" defaultValue={draft.accessToken} onBlur={(e) => commit({ accessToken: e.target.value })} />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input aria-label="使用 jsDelivr CDN" type="checkbox" defaultChecked={draft.useCDN} onChange={(e) => commit({ useCDN: e.target.checked })} />
        <span style={{ fontSize: 12 }}>通过 jsDelivr CDN 加速访问</span>
      </label>
    </CredCard>
  );
}

function AliyunForm() {
  const cfg = useImageHostStore((s) => s.configs.aliyun);
  const setConfig = useImageHostStore((s) => s.setConfig);
  const draft = {
    accessKeyId: cfg?.accessKeyId ?? "",
    accessKeySecret: cfg?.accessKeySecret ?? "",
    bucket: cfg?.bucket ?? "",
    region: cfg?.region ?? "",
    customDomain: cfg?.customDomain ?? "",
  };
  function commit(patch: Partial<typeof draft>) {
    setConfig("aliyun", { ...draft, ...patch });
  }
  return (
    <CredCard title="阿里云 OSS · 凭据">
      <Field label="AccessKeyId">
        <Input aria-label="AccessKeyId" defaultValue={draft.accessKeyId} onBlur={(e) => commit({ accessKeyId: e.target.value })} />
      </Field>
      <Field label="AccessKeySecret" hint="写后不回显">
        <Input aria-label="AccessKeySecret" type="password" defaultValue={draft.accessKeySecret} onBlur={(e) => commit({ accessKeySecret: e.target.value })} />
      </Field>
      <Field label="Bucket">
        <Input aria-label="Bucket" defaultValue={draft.bucket} onBlur={(e) => commit({ bucket: e.target.value })} />
      </Field>
      <Field label="Region">
        <Input aria-label="Region" defaultValue={draft.region} onBlur={(e) => commit({ region: e.target.value })} placeholder="oss-cn-hangzhou" />
      </Field>
      <Field label="自定义域名 (可选)" optional>
        <Input aria-label="自定义域名 (可选)" defaultValue={draft.customDomain} onBlur={(e) => commit({ customDomain: e.target.value })} />
      </Field>
    </CredCard>
  );
}

function TencentCosForm() {
  const cfg = useImageHostStore((s) => s.configs["tencent-cos"]);
  const setConfig = useImageHostStore((s) => s.setConfig);
  const draft = {
    secretId: cfg?.secretId ?? "",
    secretKey: cfg?.secretKey ?? "",
    bucket: cfg?.bucket ?? "",
    region: cfg?.region ?? "",
    customDomain: cfg?.customDomain ?? "",
  };
  function commit(patch: Partial<typeof draft>) {
    setConfig("tencent-cos", { ...draft, ...patch });
  }
  return (
    <CredCard title="腾讯云 COS · 凭据">
      <Field label="SecretId">
        <Input aria-label="SecretId" defaultValue={draft.secretId} onBlur={(e) => commit({ secretId: e.target.value })} />
      </Field>
      <Field label="SecretKey" hint="写后不回显">
        <Input aria-label="SecretKey" type="password" defaultValue={draft.secretKey} onBlur={(e) => commit({ secretKey: e.target.value })} />
      </Field>
      <Field label="Bucket">
        <Input aria-label="Bucket" defaultValue={draft.bucket} onBlur={(e) => commit({ bucket: e.target.value })} placeholder="my-bucket-1250000000" />
      </Field>
      <Field label="Region">
        <Input aria-label="Region" defaultValue={draft.region} onBlur={(e) => commit({ region: e.target.value })} placeholder="ap-guangzhou" />
      </Field>
      <Field label="自定义域名 (可选)" optional>
        <Input aria-label="自定义域名 (可选)" defaultValue={draft.customDomain} onBlur={(e) => commit({ customDomain: e.target.value })} />
      </Field>
    </CredCard>
  );
}

function CloudflareR2Form() {
  const cfg = useImageHostStore((s) => s.configs["cloudflare-r2"]);
  const setConfig = useImageHostStore((s) => s.setConfig);
  const draft = {
    accountId: cfg?.accountId ?? "",
    accessKeyId: cfg?.accessKeyId ?? "",
    secretAccessKey: cfg?.secretAccessKey ?? "",
    bucket: cfg?.bucket ?? "",
    publicDomain: cfg?.publicDomain ?? "",
  };
  function commit(patch: Partial<typeof draft>) {
    setConfig("cloudflare-r2", { ...draft, ...patch });
  }
  return (
    <CredCard title="Cloudflare R2 · 凭据">
      <Field label="Account ID">
        <Input aria-label="Account ID" defaultValue={draft.accountId} onBlur={(e) => commit({ accountId: e.target.value })} />
      </Field>
      <Field label="Access Key ID">
        <Input aria-label="Access Key ID" defaultValue={draft.accessKeyId} onBlur={(e) => commit({ accessKeyId: e.target.value })} />
      </Field>
      <Field label="Secret Access Key" hint="写后不回显">
        <Input aria-label="Secret Access Key" type="password" defaultValue={draft.secretAccessKey} onBlur={(e) => commit({ secretAccessKey: e.target.value })} />
      </Field>
      <Field label="Bucket">
        <Input aria-label="Bucket" defaultValue={draft.bucket} onBlur={(e) => commit({ bucket: e.target.value })} />
      </Field>
      <Field label="Public Domain">
        <Input aria-label="Public Domain" defaultValue={draft.publicDomain} onBlur={(e) => commit({ publicDomain: e.target.value })} />
      </Field>
    </CredCard>
  );
}
