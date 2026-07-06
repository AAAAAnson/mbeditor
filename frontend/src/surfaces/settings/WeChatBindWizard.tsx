import { useRef, useState } from "react";
import api from "@/lib/api";
import type { WeChatAccount } from "@/stores/wechatStore";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClose,
  IconShield,
  IconWarn,
} from "@/components/icons";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export interface WeChatBindPayload {
  name: string;
  appid: string;
  appsecret: string;
}

interface Props {
  /** 编辑态:回填名称/AppID(AppSecret 永不回显)。 */
  account?: WeChatAccount;
  /** 服务器已持久化密钥的 appid 列表(决定 AppSecret 是否可留空)。 */
  configured: string[];
  /** 测试连接通过、用户确认后回调,交给父组件落库 + putCredential。 */
  onBound: (payload: WeChatBindPayload) => void;
  onCancel: () => void;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export default function WeChatBindWizard({ account, configured, onBound, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<0 | 1>(0);
  const [name, setName] = useState(account?.name ?? "");
  const [appid, setAppid] = useState(account?.appid ?? "");
  const [appsecret, setAppsecret] = useState("");
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // esc=取消 + focus trap + 焦点回收(向导恒显示)。
  useFocusTrap(dialogRef, true, onCancel);

  const savedServerSide = configured.includes(appid.trim());
  // 已服务器持久化的号可留空(后端用已存密钥);否则必须填 AppSecret 才能测。
  const canTest = appid.trim().length > 0 && (appsecret.trim().length > 0 || savedServerSide);

  const onSecretChange = (value: string) => {
    setAppsecret(value);
    setTested(false);
    setErrorText(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setErrorText(null);
    try {
      const res = await api.post("/wechat/test-connection", {
        appid: appid.trim(),
        appsecret: appsecret.trim(),
      });
      const env = res?.data as { code?: number; message?: string } | undefined;
      if (env && typeof env.code === "number" && env.code !== 0) {
        // 优先透出后端可行动 message(如 IP 白名单指引);为空才落兜底。
        const backendMsg = typeof env.message === "string" ? env.message.trim() : "";
        throw new Error(backendMsg);
      }
      setTested(true);
    } catch (err) {
      setTested(false);
      const msg = err instanceof Error && err.message.trim() ? err.message.trim() : "";
      setErrorText(msg ? `连接失败:${msg}` : "连接失败,请检查 AppID / AppSecret");
    } finally {
      setTesting(false);
    }
  };

  const handleConfirm = () => {
    if (!tested) return;
    onBound({ name: name.trim(), appid: appid.trim(), appsecret: appsecret.trim() });
  };

  return (
    <div className="bw-ov" onClick={onCancel}>
      <div
        className="bw"
        data-testid="wechat-bind-wizard"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 横带1:顶部图标条 */}
        <div className="bw-top">
          <span className="bw-topico"><IconShield size={20} /></span>
          <div style={{ flex: 1 }}>
            <div className="bw-toptitle">{account ? "编辑公众号" : "添加公众号"}</div>
            <div className="bw-topsub">填好 AppID 与密钥,测通才能绑定。密钥只存服务端、不进浏览器。</div>
          </div>
          <button className="btn btn-ghost btn-sm" aria-label="关闭" onClick={onCancel}>
            <IconClose size={18} />
          </button>
        </div>

        {/* 横带2:两步 stepper */}
        <div className="bw-steps">
          <span className={cx("bw-stepdot", step === 0 && "on", step > 0 && "done")}>
            <span className="bw-stepn">{step > 0 ? <IconCheck size={13} /> : "1"}</span>账号信息
          </span>
          <span className="bw-stepsep" />
          <span className={cx("bw-stepdot", step === 1 && "on")}>
            <span className="bw-stepn">2</span>密钥 + 测连接
          </span>
        </div>

        {/* 横带3:正文 */}
        <div className="bw-body">
          {step === 0 ? (
            <>
              <Field label="公众号名称">
                <Input aria-label="名称" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="AppID">
                <Input aria-label="AppID" value={appid} onChange={(e) => setAppid(e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field
                label="AppSecret"
                hint={
                  savedServerSide
                    ? "已保存的号可留空,将使用服务器已存的密钥测试。"
                    : undefined
                }
              >
                <Input
                  aria-label="AppSecret"
                  type="password"
                  value={appsecret}
                  onChange={(e) => onSecretChange(e.target.value)}
                />
              </Field>

              {errorText && (
                <div className="bw-errbar">
                  <IconWarn size={17} />
                  <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{errorText}</div>
                </div>
              )}
              {tested && (
                <div className="bw-okbar">
                  <IconCheck size={16} /> 连接成功,可以绑定了
                </div>
              )}
            </>
          )}
        </div>

        {/* 横带4:底部按钮带 */}
        <div className="bw-foot">
          {step === 1 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setStep(0)}>
              <IconArrowLeft size={12} /> 上一步
            </button>
          )}
          <span className="fgrow" />
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>取消</button>
          {step === 0 ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={appid.trim().length === 0}
              onClick={() => setStep(1)}
            >
              下一步 <IconArrowRight size={12} />
            </button>
          ) : tested ? (
            <button className="btn btn-primary btn-sm" onClick={handleConfirm}>
              <IconCheck size={13} /> 确认绑定
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              disabled={testing || !canTest}
              onClick={handleTest}
            >
              {testing ? "测试中…" : "测试连接"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
