import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

/** 状态码 → 用户友好中文。未列举的走兜底(见 friendlyErrorMessage)。 */
const STATUS_MESSAGES: Record<number, string> = {
  400: "请求参数有误,请检查后重试",
  401: "登录状态已失效,请重新登录",
  403: "没有权限执行此操作",
  404: "请求的资源不存在",
  408: "请求超时,请稍后重试",
  409: "操作冲突,请刷新后重试",
  413: "上传内容过大",
  422: "提交的内容格式不正确",
  429: "操作太频繁,请稍后再试",
  500: "服务器开小差了,请稍后重试",
  502: "网关错误,服务暂时不可用,请稍后重试",
  503: "服务暂时不可用,请稍后重试",
  504: "网关超时,请稍后重试",
};

/**
 * 把 axios 错误(网络/超时/取消/HTTP 状态码)映射成用户友好中文。
 * 故意只看 error.code / error.message / error.response.status —— 后端 4xx/5xx 的
 * data.detail 多为英文(404/400)或数组(422),5xx 的 str(exc) 还可能含内部细节
 * (触碰敏感数据准则),一律不回显,改用状态码中文兜底。
 * 注:后端业务错误走 HTTP 200 + {code≠0, message:中文},由各处 unwrap 抛出、
 * 不经本函数(axios resolve 不进 reject)。
 */
export function friendlyErrorMessage(error: unknown): string {
  const ax = (error ?? {}) as {
    code?: string;
    message?: string;
    response?: { status?: number };
  };

  if (ax.code === "ECONNABORTED" || (typeof ax.message === "string" && /timeout/i.test(ax.message))) {
    return "请求超时,请稍后重试";
  }

  const status = ax.response?.status;
  if (typeof status !== "number") {
    // 无 response:网络错误 / 取消 / 未知
    if (ax.code === "ERR_CANCELED") return "请求已取消";
    return "网络连接失败,请检查网络后重试";
  }

  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (status >= 500) return `服务器错误(状态码 ${status}),请稍后重试`;
  return `请求失败(状态码 ${status}),请稍后重试`;
}

/**
 * response 错误 interceptor 的 onRejected。
 * 只把 error.message 改写成友好中文,其余字段(尤其 error.response / response.data /
 * config)原封不动 —— 消费层 getErrorMessage / extractErrorMessage 仍依赖 response.data。
 * 始终 reject,使各处 catch 照常触发。
 */
export function rewriteAxiosError(error: unknown): Promise<never> {
  if (error && typeof error === "object") {
    try {
      const friendly = friendlyErrorMessage(error);
      (error as { message?: string }).message = friendly;

      // 5xx 净化:全局异常处理器把 str(exc)(可能含 /app/... 内部路径)放进
      // {code, message}。消费层 getErrorMessage / extractErrorMessage 会优先读
      // response.data 而非 error.message,故仅改 error.message 仍会经 helper 漏出
      // 英文 + 敏感路径。这里把 5xx 信封里已有的 message 也覆盖成友好中文(只覆盖
      // 已存在的字符串 message,不新增字段;4xx 如 413 的后端中文 message 保留)。
      const response = (error as { response?: { status?: number; data?: unknown } }).response;
      const status = response?.status;
      const data = response?.data;
      if (
        typeof status === "number" &&
        status >= 500 &&
        data &&
        typeof data === "object" &&
        typeof (data as { message?: unknown }).message === "string"
      ) {
        (data as { message?: string }).message = friendly;
      }
    } catch {
      // 某些错误的字段只读,放弃改写、原样抛出。
    }
  }
  return Promise.reject(error);
}

api.interceptors.response.use((response) => response, rewriteAxiosError);

export default api;
