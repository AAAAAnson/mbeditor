import { useState, useEffect } from "react";
import {
  Eye,
  EyeOff,
  TriangleAlert,
  CircleCheck,
  CircleX,
  CircleHelp,
  Zap,
  Check,
  Send,
  Archive,
  Loader2,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import api from "@/lib/api";
import { toast } from "@/stores/toastStore";
import type { Article } from "@/types";

interface PublishModalProps {
  open: boolean;
  onClose: () => void;
  article: Article;
}

type ConnectionStatus = "disconnected" | "testing" | "connected" | "failed";

export default function PublishModal({
  open,
  onClose,
  article,
}: PublishModalProps) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [configured, setConfigured] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [failMessage, setFailMessage] = useState("");

  // Article form fields (State B)
  const [title, setTitle] = useState("");
  const [digest, setDigest] = useState("");
  const [author, setAuthor] = useState("");

  // Load config on open
  useEffect(() => {
    if (!open) return;
    setTitle(article.title || "");
    setDigest(article.digest || "");
    setAuthor(article.author || "");

    api
      .get("/config")
      .then((res) => {
        if (res.data.code === 0) {
          const cfg = res.data.data;
          if (cfg.appid) {
            setAppId(cfg.appid);
            setAppSecret(cfg.appsecret || "");
            setConfigured(true);
            setConnectionStatus("connected");
            setAccountName(cfg.account_name || "已配置公众号");
          } else {
            setConfigured(false);
            setConnectionStatus("disconnected");
          }
        }
      })
      .catch(() => {
        setConfigured(false);
        setConnectionStatus("disconnected");
      });
  }, [open, article]);

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionStatus("testing");
    setFailMessage("");
    try {
      const res = await api.post("/config/test", {
        appid: appId,
        appsecret: appSecret,
      });
      if (res.data.code === 0) {
        setConnectionStatus("connected");
        setConfigured(true);
        setAccountName(res.data.data.account_name || "已配置公众号");
        toast.success("连接成功", "微信公众号配置有效");
      } else {
        setConnectionStatus("failed");
        setFailMessage(res.data.message || "请检查 AppID 和 AppSecret");
        toast.error("连接失败", res.data.message || "请检查 AppID 和 AppSecret");
      }
    } catch (e: unknown) {
      setConnectionStatus("failed");
      const err = e as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || "无法连接到微信服务器";
      setFailMessage(msg);
      toast.error("连接失败", msg);
    }
    setTesting(false);
  };

  const handleSaveAndPublish = async () => {
    setPublishing(true);
    try {
      // Save config first if not configured yet
      if (!configured) {
        await api.put("/config", { appid: appId, appsecret: appSecret });
      }
      // Save article metadata
      await api.put(`/articles/${article.id}`, {
        html: article.html,
        css: article.css,
        js: article.js || "",
        markdown: article.markdown,
        title,
        digest,
        author,
        mode: article.mode,
      });
      // Publish to draft (longer timeout for image uploading)
      const res = await api.post(
        "/publish/draft",
        { article_id: article.id },
        { timeout: 300000 }
      );
      if (res.data.code === 0) {
        toast.success("发布成功", "文章已推送到微信草稿箱");
        onClose();
      } else {
        toast.error("发布失败", res.data.message);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error("发布失败", err.response?.data?.message || "推送失败");
    }
    setPublishing(false);
  };

  const handleSaveDraft = async () => {
    try {
      await api.put(`/articles/${article.id}`, {
        html: article.html,
        css: article.css,
        js: article.js || "",
        markdown: article.markdown,
        title,
        digest,
        author,
        mode: article.mode,
      });
      toast.success("已保存", "文章已保存为草稿");
      onClose();
    } catch {
      toast.error("保存失败", "无法保存文章");
    }
  };

  // --- Status banner (matches design: warning / testing / connected / failed) ---
  const statusBanner = () => {
    if (configured && connectionStatus === "connected") {
      // State B: green success banner (design: pcConn)
      return (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[var(--color-success)]/5 border border-[var(--color-success)]/20">
          <CircleCheck size={16} className="text-success shrink-0" />
          <span className="text-[12px] font-medium text-success">
            已连接：{accountName}
          </span>
        </div>
      );
    }
    if (connectionStatus === "testing") {
      // Testing state: amber spinner banner
      return (
        <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/20">
          <Loader2 size={16} className="text-warning shrink-0 animate-spin" />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-warning">
              正在验证连接...
            </span>
            <span className="text-[12px] text-warning/70 leading-relaxed">
              正在向微信服务器发送验证请求，请稍候。
            </span>
          </div>
        </div>
      );
    }
    if (connectionStatus === "failed") {
      // Failed state: red error banner
      return (
        <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg bg-[var(--color-error)]/5 border border-[var(--color-error)]/20">
          <CircleX size={16} className="text-error shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-error">
              连接失败
            </span>
            <span className="text-[12px] text-error/70 leading-relaxed">
              {failMessage || "请检查 AppID 和 AppSecret 是否正确。"}
            </span>
          </div>
        </div>
      );
    }
    // Default: disconnected warning banner (design: pmWarn)
    return (
      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/20">
        <TriangleAlert size={16} className="text-warning shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-warning">
            尚未配置公众号
          </span>
          <span className="text-[12px] text-warning/70 leading-relaxed">
            请填入微信公众号 AppID 和 AppSecret，用于将文章推送到公众号草稿箱。
          </span>
        </div>
      </div>
    );
  };

  const footer = (
    <div className="flex items-center justify-between">
      <div>
        {!configured && (
          <a
            href="https://mp.weixin.qq.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-fg-muted hover:text-accent transition-colors flex items-center gap-1.5"
          >
            <CircleHelp size={14} />
            如何获取 AppID？
          </a>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <Button variant="ghost" size="sm" onClick={onClose}>
          取消
        </Button>
        {!configured ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<Zap size={14} />}
              onClick={handleTestConnection}
              disabled={!appId || !appSecret || testing}
              loading={testing}
            >
              {testing ? "测试中..." : "测试连接"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Check size={14} />}
              onClick={handleSaveAndPublish}
              disabled={
                !appId ||
                !appSecret ||
                connectionStatus !== "connected" ||
                publishing
              }
              loading={publishing}
            >
              {publishing ? "发布中..." : "保存并发布"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<Archive size={14} />}
              onClick={handleSaveDraft}
            >
              存为草稿
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Send size={14} />}
              onClick={handleSaveAndPublish}
              disabled={publishing}
              loading={publishing}
            >
              {publishing ? "发布中..." : "发布到草稿箱"}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={configured ? "发布到微信公众号" : "配置微信公众号"}
      subtitle={configured ? "确认文章信息后发布到草稿箱" : "首次使用需要配置公众号凭证"}
      width={480}
      footer={footer}
    >
      <div className="px-6 py-5 space-y-[18px]">
        {!configured ? (
          <>
            {/* State A: Not configured — status banner */}
            {statusBanner()}

            {/* AppID */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-fg-primary flex items-center gap-1">
                AppID
                <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="wx..."
                className="w-full bg-surface-tertiary border border-border-secondary rounded-lg px-3.5 py-2.5 text-[13px] font-mono text-fg-primary placeholder:text-fg-muted outline-none transition-colors duration-150 focus:border-accent"
              />
              <span className="text-[11px] text-fg-muted">
                在公众号后台 → 开发 → 基本配置中获取
              </span>
            </div>

            {/* AppSecret */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-fg-primary flex items-center gap-1">
                AppSecret
                <span className="text-error">*</span>
              </label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="输入 AppSecret"
                  className="w-full bg-surface-tertiary border border-border-secondary rounded-lg px-3.5 py-2.5 pr-9 text-[13px] font-mono text-fg-primary placeholder:text-fg-muted outline-none transition-colors duration-150 focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-fg-muted hover:text-fg-secondary transition-colors cursor-pointer"
                >
                  {showSecret ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </div>
              <span className="text-[11px] text-fg-muted">
                AppSecret 仅存储在本地，不会上传到任何服务器
              </span>
            </div>
          </>
        ) : (
          <>
            {/* State B: Configured */}
            {/* Connected banner */}
            {statusBanner()}

            {/* Article preview card (design: pcPreview) */}
            <div className="flex items-center gap-3.5 p-3.5 bg-surface-tertiary rounded-[10px] border border-border-secondary">
              {article.cover ? (
                <img
                  src={article.cover}
                  alt="cover"
                  className="w-20 h-[60px] rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="w-20 h-[60px] rounded-md bg-bg-primary shrink-0 flex items-center justify-center">
                  <span className="text-[11px] text-fg-muted">封面</span>
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="text-[14px] font-semibold text-fg-primary truncate">
                  {article.title || "无标题"}
                </div>
                <div className="text-[11px] font-mono text-fg-muted">
                  {article.mode === "markdown" ? "Markdown" : "HTML"} ·{" "}
                  {new Date(article.updated_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <Input
                label="文章标题"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg-primary">
                  摘要
                </label>
                <textarea
                  value={digest}
                  onChange={(e) => setDigest(e.target.value)}
                  rows={2}
                  placeholder="从创意到落地的完整旅程"
                  className="w-full bg-surface-tertiary border border-border-secondary rounded-lg px-3.5 py-2.5 text-[13px] text-fg-primary placeholder:text-fg-muted outline-none transition-colors duration-150 focus:border-accent resize-none"
                />
              </div>
              <Input
                label="作者"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
