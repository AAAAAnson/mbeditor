import { useEffect, useState } from "react";
import {
  Archive,
  Check,
  CircleCheck,
  CircleHelp,
  CircleX,
  Eye,
  EyeOff,
  Loader2,
  Send,
  TriangleAlert,
  Zap,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { toast } from "@/stores/toastStore";
import type { Article } from "@/types";
import type {
  PublishMetadataDraft,
  PublishMetadataField,
} from "@/features/editor/types";
import {
  type PublishArticleResult,
  type WechatConfigInput,
  getErrorMessage,
  loadWechatConfig,
  testWechatConfig,
} from "@/features/editor/services/DocumentActionService";

interface PublishModalProps {
  open: boolean;
  onClose: () => void;
  article: Article;
  metadata: PublishMetadataDraft;
  onMetadataChange: (field: PublishMetadataField, value: string) => void;
  onSaveDraft: () => Promise<void>;
  onPublish: (options?: {
    config?: WechatConfigInput;
    persistConfig?: boolean;
    timeoutMs?: number;
  }) => Promise<PublishArticleResult>;
}

type ConnectionStatus = "disconnected" | "testing" | "connected" | "failed";

export default function PublishModal({
  open,
  onClose,
  article,
  metadata,
  onMetadataChange,
  onSaveDraft,
  onPublish,
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

  useEffect(() => {
    if (!open) {
      return;
    }

    setFailMessage("");

    loadWechatConfig()
      .then((config) => {
        setAppId(config.appid);
        setAppSecret(config.appsecret);
        setConfigured(config.configured);
        setConnectionStatus(config.configured ? "connected" : "disconnected");
        setAccountName(config.accountName || "已配置公众号");
      })
      .catch(() => {
        setAppId("");
        setAppSecret("");
        setConfigured(false);
        setConnectionStatus("disconnected");
      });
  }, [open, article]);

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionStatus("testing");
    setFailMessage("");
    try {
      const config = await testWechatConfig({
        appid: appId,
        appsecret: appSecret,
      });
      setConnectionStatus("connected");
      setConfigured(true);
      setAccountName(config.accountName || "已配置公众号");
      toast.success("连接成功", "微信公众号配置有效。");
    } catch (error: unknown) {
      const message = getErrorMessage(error, "无法连接到微信服务器。");
      setConnectionStatus("failed");
      setFailMessage(message);
      toast.error("连接失败", message);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAndPublish = async () => {
    setPublishing(true);
    try {
      const result = await onPublish({
        config: !configured
          ? {
              appid: appId,
              appsecret: appSecret,
            }
          : undefined,
        persistConfig: !configured,
        timeoutMs: 300000,
      });
      toast.success("发布成功", result.message);
      onClose();
    } catch (error: unknown) {
      toast.error("发布失败", getErrorMessage(error, "推送失败。"));
    } finally {
      setPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      await onSaveDraft();
      toast.success("已保存", "文章已保存为草稿。");
      onClose();
    } catch (error: unknown) {
      toast.error("保存失败", getErrorMessage(error, "无法保存文章。"));
    }
  };

  const renderStatusBanner = () => {
    if (configured && connectionStatus === "connected") {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-success)]/20 bg-[var(--color-success)]/5 px-3.5 py-2.5">
          <CircleCheck size={16} className="shrink-0 text-success" />
          <span className="text-[12px] font-medium text-success">
            已连接：{accountName}
          </span>
        </div>
      );
    }

    if (connectionStatus === "testing") {
      return (
        <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/5 px-3.5 py-3">
          <Loader2 size={16} className="shrink-0 animate-spin text-warning" />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-warning">
              正在验证连接...
            </span>
            <span className="text-[12px] leading-relaxed text-warning/70">
              正在向微信服务器发送验证请求，请稍候。
            </span>
          </div>
        </div>
      );
    }

    if (connectionStatus === "failed") {
      return (
        <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error)]/5 px-3.5 py-3">
          <CircleX size={16} className="shrink-0 text-error" />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-error">
              连接失败
            </span>
            <span className="text-[12px] leading-relaxed text-error/70">
              {failMessage || "请检查 AppID 和 AppSecret 是否正确。"}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/5 px-3.5 py-3">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-warning">
            尚未配置公众号
          </span>
          <span className="text-[12px] leading-relaxed text-warning/70">
            请填写微信公众号 AppID 和 AppSecret，用于将文章推送到公众号草稿箱。
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
            className="flex items-center gap-1.5 text-[12px] text-fg-muted transition-colors hover:text-accent"
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
      subtitle={
        configured ? "确认文章信息后发布到草稿箱" : "首次使用需要先配置公众号凭证"
      }
      width={480}
      footer={footer}
    >
      <div className="space-y-[18px] px-6 py-5">
        {renderStatusBanner()}

        {!configured && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-[12px] font-medium text-fg-primary">
                AppID
                <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
                className="w-full rounded-[8px] border border-border-secondary bg-surface-tertiary px-3.5 py-2.5 text-[13px] text-fg-primary outline-none transition-colors focus:border-accent"
                placeholder="请输入公众号 AppID"
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-[12px] font-medium text-fg-primary">
                AppSecret
                <span className="text-error">*</span>
              </label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={appSecret}
                  onChange={(event) => setAppSecret(event.target.value)}
                  className="w-full rounded-[8px] border border-border-secondary bg-surface-tertiary px-3.5 py-2.5 pr-11 text-[13px] text-fg-primary outline-none transition-colors focus:border-accent"
                  placeholder="请输入公众号 AppSecret"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted transition-colors hover:text-fg-primary"
                  aria-label={showSecret ? "隐藏密钥" : "显示密钥"}
                  title={showSecret ? "隐藏密钥" : "显示密钥"}
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-fg-primary">
              标题
            </label>
            <input
              type="text"
              value={metadata.title}
              onChange={(event) => onMetadataChange("title", event.target.value)}
              className="w-full rounded-[8px] border border-border-secondary bg-surface-tertiary px-3.5 py-2.5 text-[13px] text-fg-primary outline-none transition-colors focus:border-accent"
              placeholder="文章标题"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-fg-primary">
              作者
            </label>
            <input
              type="text"
              value={metadata.author}
              onChange={(event) => onMetadataChange("author", event.target.value)}
              className="w-full rounded-[8px] border border-border-secondary bg-surface-tertiary px-3.5 py-2.5 text-[13px] text-fg-primary outline-none transition-colors focus:border-accent"
              placeholder="文章作者"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-fg-primary">
              摘要
            </label>
            <textarea
              value={metadata.digest}
              onChange={(event) => onMetadataChange("digest", event.target.value)}
              className="min-h-[96px] w-full rounded-[8px] border border-border-secondary bg-surface-tertiary px-3.5 py-2.5 text-[13px] text-fg-primary outline-none transition-colors focus:border-accent"
              placeholder="文章摘要"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
