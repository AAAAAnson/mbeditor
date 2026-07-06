// frontend/src/surfaces/editor/chat/chatPresent.ts
// ChatPanel 展示层纯函数:工具活动条目中文动词化 + 写工具反馈(repairs/violations)
// 的容错解析。summary 是后端裁剪过的裸 JSON,这里逐字段守卫,绝不裸断言。

/** 8 工具 → 中文动词短语(spec §4;后端新增工具走兜底,不至于渲染空白)。 */
const TOOL_SUBJECTS: Record<string, string> = {
  read_article: "读取文章结构",
  read_blocks: "读取内容块",
  replace_block: "改写",
  apply_block_style: "调整块样式",
  set_design_tokens: "应用整体设计",
  edit_structure: "调整文章结构",
  list_capabilities: "查询排版能力",
};

/** 内部块 id(b1/b2…)转用户可读的「第 N 块」;别的形状原样返回,不猜。 */
function friendlyBlockRef(id: string): string {
  const m = /^b(\d+)$/.exec(id);
  return m ? `第 ${m[1]} 块` : id;
}

/** 从 tool_call arguments 里挖块号(block_id/id/block_ids/ids),没有返回空串。 */
export function blockRefFromArgs(args?: Record<string, unknown>): string {
  if (!args) return "";
  for (const key of ["block_id", "id"]) {
    const v = args[key];
    if (typeof v === "string" && v.trim()) return friendlyBlockRef(v.trim());
  }
  for (const key of ["block_ids", "ids"]) {
    const v = args[key];
    if (Array.isArray(v)) {
      const ids = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (ids.length > 0) return ids.map(friendlyBlockRef).join("、");
    }
  }
  return "";
}

/** 工具活动条目文案:「正在读取文章结构」「改写块 b3 完成」「调整文章结构 失败」。 */
export function toolActivityLabel(
  name: string,
  status: "running" | "ok" | "failed",
  args?: Record<string, unknown>,
): string {
  const subject = TOOL_SUBJECTS[name] ?? `调用 ${name}`;
  const blockRef = blockRefFromArgs(args);
  const full = blockRef ? `${subject} ${blockRef}` : subject;
  if (status === "running") return `正在${full}`;
  if (status === "failed") return `${full} 失败`;
  return `${full} 完成`;
}

export interface WriteToolFeedback {
  /** T1 确定性修补的条数。 */
  repairs: number;
  /** T2 未修复项:块号 + 可执行中文修复提示(fix_hint,缺失退回 rule)。 */
  violations: { blockId: string; fixHint: string }[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 解析写工具返回值里的规则引擎结果 `{applied, repairs:[…], violations:[…]}`。
 * 不是写工具/无修补无违规 → null(条目不渲染反馈行)。
 */
export function parseWriteToolFeedback(summary: unknown): WriteToolFeedback | null {
  if (!isRecord(summary)) return null;
  const repairs = Array.isArray(summary.repairs) ? summary.repairs.length : 0;
  const violations = Array.isArray(summary.violations)
    ? summary.violations.flatMap((v) => {
        if (!isRecord(v)) return [];
        const blockId = typeof v.block_id === "string" ? v.block_id : "";
        const fixHint =
          typeof v.fix_hint === "string" && v.fix_hint
            ? v.fix_hint
            : typeof v.rule === "string"
              ? v.rule
              : "";
        if (!blockId && !fixHint) return [];
        return [{ blockId, fixHint }];
      })
    : [];
  if (repairs === 0 && violations.length === 0) return null;
  return { repairs, violations };
}

/** 块 kind → 中文名(汇总卡用)。 */
export function blockKindLabel(kind: string): string {
  switch (kind) {
    case "heading":
      return "标题块";
    case "text":
      return "正文块";
    case "image":
      return "图片块";
    case "svg":
      return "图形块";
    case "divider":
      return "分隔块";
    case "raw":
      return "代码块";
    default:
      return kind;
  }
}
