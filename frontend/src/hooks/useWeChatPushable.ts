// H5:草稿箱/发布 gate 的共享判据。
// 旧判据只看内存 appsecret——但 wechatStore 持久化会剥离 appsecret(安全红线,
// 绝不为 gate 而持久化密钥),导致回访用户重开浏览器后恒被降级说「先去绑定」,
// 而后端本就支持空 secret fallback 服务端 credentials。这里把判据放宽为:
//   内存有密钥(本会话刚绑) OR 活跃号 appid 在服务器 configured 列表。
import { useEffect, useState } from "react";
import { useWeChatStore, type WeChatAccount } from "@/stores/wechatStore";
import { getCredentials } from "@/surfaces/settings/credentialsApi";

export interface WeChatPushable {
  /** 当前活跃号可以走草稿箱/发布(密钥在内存或服务器)。 */
  canPush: boolean;
  /** 活跃账号(无则 null)。 */
  account: WeChatAccount | null;
}

export function useWeChatPushable(): WeChatPushable {
  const account = useWeChatStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId) ?? null,
  );
  const [serverConfigured, setServerConfigured] = useState<string[]>([]);
  const appid = account?.appid ?? "";

  useEffect(() => {
    let alive = true;
    if (!appid) {
      // 无活跃账号(或未填 appid)时列表命中不可能成立,不白发请求。
      setServerConfigured([]);
      return () => {
        alive = false;
      };
    }
    getCredentials()
      .then((list) => {
        if (alive) setServerConfigured(list);
      })
      .catch(() => {
        // 静默降级:拉不到服务器列表就当作空(不 toast、不误开 gate)。
        if (alive) setServerConfigured([]);
      });
    return () => {
      alive = false;
    };
  }, [appid]);

  const canPush = Boolean(
    account && (account.appsecret || (account.appid && serverConfigured.includes(account.appid))),
  );
  return { canPush, account };
}
