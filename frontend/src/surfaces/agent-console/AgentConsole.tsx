import { useEffect, useRef, useState } from "react";
import { IconArrowRight, IconTerminal } from "@/components/icons";
import Chip from "@/components/shared/Chip";
import api from "@/lib/api";
import type { Route } from "@/types";

type RunStatus = "empty" | "draft" | "ready";
type RunEventKind = "meta" | "fact" | "warning";

interface RunEvent {
  ts: string;
  kind: RunEventKind;
  text: string;
}

interface RunRecord {
  id: string;
  source: string;
  article_id: string;
  article_title: string;
  mode: "html" | "markdown";
  status: RunStatus;
  status_label: string;
  step_label: string;
  readiness_pct: number;
  started_at: string;
  updated_at: string;
  body_chars: number;
  has_cover: boolean;
  has_author: boolean;
  has_digest: boolean;
  capabilities: {
    pause: boolean;
    command: boolean;
    live_terminal: boolean;
    preview: boolean;
    publish: boolean;
  };
  events: RunEvent[];
}

interface RunsPayload {
  mode: string;
  generated_at: string;
  notice: string;
  summary: {
    total: number;
    ready: number;
    draft: number;
    empty: number;
    wechat_configured: boolean;
  };
  capabilities: {
    data_source: string;
    persisted_runs: boolean;
    pause: boolean;
    command: boolean;
    live_terminal: boolean;
  };
  items: RunRecord[];
}

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

const STATUS_TONE: Record<RunStatus, "" | "gold" | "accent" | "forest" | "info" | "warn"> = {
  empty: "info",
  draft: "gold",
  ready: "forest",
};

function progressColor(status: RunStatus): string {
  if (status === "ready") return "var(--forest)";
  if (status === "draft") return "var(--gold)";
  return "var(--info)";
}

function formatShort(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatRelative(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;

  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  return `${Math.floor(diff / day)} 天前`;
}

function EventLine({ ts, kind, text }: RunEvent) {
  const color =
    kind === "warning" ? "var(--accent)" :
    kind === "meta" ? "var(--fg-4)" :
    "var(--forest)";
  const marker = kind === "warning" ? "!" : kind === "meta" ? "·" : "→";

  return (
    <div className="slide-up" style={{ display: "flex", gap: 10 }}>
      <span style={{ color: "var(--fg-5)", userSelect: "none" }}>{formatShort(ts)}</span>
      <span style={{ color, width: 12, textAlign: "center", userSelect: "none" }}>{marker}</span>
      <span style={{ color, flex: 1 }}>{text}</span>
    </div>
  );
}

interface DetailPanelProps {
  run: RunRecord | null;
  notice: string;
  loading: boolean;
  onRefresh: () => void;
  go: (route: Route, params?: Record<string, string>) => void;
}

function DetailPanel({ run, notice, loading, onRefresh, go }: DetailPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = 0;
  }, [run?.id]);

  if (!run) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-deep)" }}>
        <div style={{ padding: "16px 22px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "var(--accent-soft)", border: "1px solid var(--accent-glow)",
              display: "grid", placeItems: "center", color: "var(--accent)",
            }}>
              <IconTerminal size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--fg-4)", letterSpacing: "0.1em" }}>
                READ ONLY CONTROL ROOM
              </div>
              <div className="title-serif" style={{ fontSize: 20, color: "var(--fg)" }}>
                暂无活动记录
              </div>
            </div>
          </div>
        </div>

        <div style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: "32px 28px",
          color: "var(--fg-3)",
          textAlign: "center",
        }}>
          <div style={{ maxWidth: 380 }}>
            <div className="title-serif" style={{ fontSize: 28, color: "var(--fg)", marginBottom: 10 }}>
              还没有可展示的稿件活动。
            </div>
            <p style={{ margin: 0, lineHeight: 1.8 }}>
              {notice}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
              <button className="btn btn-outline btn-sm" onClick={onRefresh} disabled={loading}>
                {loading ? "刷新中…" : "刷新数据"}
              </button>
              <button className="btn btn-accent btn-sm" onClick={() => go("list")}>
                打开稿库 <IconArrowRight size={10} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-deep)" }}>
      <div style={{ padding: "16px 22px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--accent-soft)", border: "1px solid var(--accent-glow)",
            display: "grid", placeItems: "center", color: "var(--accent)",
          }}>
            <IconTerminal size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 10, color: "var(--fg-4)", letterSpacing: "0.1em" }}>
              {run.article_id} · {run.source}
            </div>
            <div className="title-serif" style={{ fontSize: 20, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {run.article_title}
            </div>
          </div>
          <Chip tone={STATUS_TONE[run.status]}>{run.status_label}</Chip>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Chip>{run.mode.toUpperCase()}</Chip>
          <Chip tone="gold">{run.readiness_pct}% 就绪度</Chip>
          <Chip tone={run.capabilities.publish ? "forest" : "info"}>
            {run.capabilities.publish ? "可投递" : "未投递就绪"}
          </Chip>
          <Chip>{run.body_chars} chars</Chip>
          <div style={{ flex: 1 }} />
          <button className="btn btn-outline btn-sm" onClick={onRefresh} disabled={loading}>
            {loading ? "刷新中…" : "刷新数据"}
          </button>
          <button className="btn btn-accent btn-sm" onClick={() => go("list")}>
            打开稿库 <IconArrowRight size={10} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1, overflow: "auto", padding: "10px 18px",
          fontFamily: "var(--f-mono)", fontSize: 12, lineHeight: 1.7,
          color: "var(--fg-3)", minHeight: 0,
        }}
      >
        {run.events.map((event, index) => <EventLine key={`${run.id}-${index}`} {...event} />)}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
        <div className="caps" style={{ marginBottom: 10 }}>能力边界</div>
        <div style={{ display: "grid", gap: 8, fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--fg-3)" }}>
          <div>暂停: {run.capabilities.pause ? "已启用" : "未实现"}</div>
          <div>下指令: {run.capabilities.command ? "已启用" : "未实现"}</div>
          <div>实时终端: {run.capabilities.live_terminal ? "已启用" : "未实现"}</div>
          <div>说明: {notice}</div>
        </div>
      </div>
    </div>
  );
}

export default function AgentConsole({ go }: { go: (route: Route, params?: Record<string, string>) => void }) {
  const [payload, setPayload] = useState<RunsPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<RunsPayload>>("/runs");
      const next = res.data.data;
      setPayload(next);
      setSelectedId((current) => {
        if (!next.items.length) return null;
        if (current && next.items.some((item) => item.id === current)) return current;
        return next.items[0].id;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法加载 runs 数据");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRuns();
  }, []);

  const runs = payload?.items ?? [];
  const active = runs.find((item) => item.id === selectedId) ?? runs[0] ?? null;
  const notice = payload?.notice ?? "当前控制台只展示真实已保存数据，不展示伪造终端流。";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 520px", height: "100%", minHeight: 0, background: "var(--bg)" }}>
      <div style={{ overflow: "auto", padding: "36px 40px 40px", borderRight: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
          <span className="caps caps-gold">CONTROL ROOM &middot; 真实活动台</span>
          <div className="hair-rule" style={{ flex: 1 }} />
          <span className="caps tnum">
            {payload ? `${payload.summary.total} RECORDS · ${payload.capabilities.persisted_runs ? "LIVE" : "READ ONLY"}` : "LOADING"}
          </span>
        </div>

        <h1 className="title-serif" style={{ fontSize: 64, margin: "6px 0 6px" }}>
          保存下来的稿件<br />
          <span style={{ color: "var(--gold)", fontStyle: "italic" }}>真实活动台</span>
          <span style={{ color: "var(--accent)" }}>.</span>
        </h1>
        <p style={{ margin: "6px 0 28px", color: "var(--fg-3)", fontSize: 14, fontFamily: "var(--f-display)", fontStyle: "italic" }}>
          {notice}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
          {([
            { k: "活动记录", v: payload ? String(payload.summary.total).padStart(2, "0") : "--", d: "来自真实稿件存储", tone: "gold" },
            { k: "可投递", v: payload ? String(payload.summary.ready).padStart(2, "0") : "--", d: payload?.summary.wechat_configured ? "公众号已配置" : "配置缺失", tone: "forest" },
            { k: "待配置", v: payload ? String(payload.summary.draft).padStart(2, "0") : "--", d: "正文已存在但未打通发布", tone: "" },
            { k: "控制能力", v: payload?.capabilities.persisted_runs ? "LIVE" : "READ", d: "暂停 / 指令 / 实时流未启用", tone: "" },
          ] as const).map((kpi, i) => (
            <div key={i} style={{
              padding: "16px 16px 14px", background: "var(--surface)",
              border: "1px solid var(--border)", borderRadius: 10,
              position: "relative", overflow: "hidden",
            }}>
              <div className="caps" style={{ marginBottom: 10 }}>{kpi.k}</div>
              <div
                className="title-serif tnum"
                style={{
                  fontSize: 40,
                  color: kpi.tone === "gold" ? "var(--gold)" : kpi.tone === "forest" ? "var(--forest)" : "var(--fg)",
                }}
              >
                {kpi.v}
              </div>
              <div className="mono" style={{ fontSize: 10, color: "var(--fg-4)", marginTop: 4, letterSpacing: "0.05em" }}>
                {kpi.d}
              </div>
              <div style={{
                position: "absolute", right: 10, top: 10,
                fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--fg-5)",
              }}>
                {String(i + 1).padStart(2, "0")}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <span className="caps">活动记录 &middot; READ ONLY RUNS</span>
          <div className="hair-rule" style={{ flex: 1 }} />
          <button className="btn btn-outline btn-sm" onClick={() => void loadRuns()} disabled={loading}>
            {loading ? "刷新中…" : "刷新"}
          </button>
        </div>

        {error && (
          <div style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid var(--accent-glow)",
            background: "var(--accent-soft)",
            color: "var(--accent)",
            fontSize: 13,
          }}>
            无法获取 runs 数据：{error}
          </div>
        )}

        <div style={{
          display: "grid", gridTemplateColumns: "90px 1fr 100px 80px 90px",
          padding: "8px 10px", borderBottom: "1px solid var(--border)", marginBottom: 4,
        }}>
          <span className="caps">ID</span>
          <span className="caps">文章 / 就绪度</span>
          <span className="caps">来源</span>
          <span className="caps">状态</span>
          <span className="caps tnum" style={{ textAlign: "right" }}>更新</span>
        </div>

        {runs.length === 0 && !loading ? (
          <div style={{
            padding: "18px 12px",
            color: "var(--fg-4)",
            borderBottom: "1px solid var(--border)",
          }}>
            当前没有可展示的活动记录。先在稿库创建或保存一篇文章，这里才会出现真实数据。
          </div>
        ) : (
          runs.map((run) => (
            <div
              key={run.id}
              onClick={() => setSelectedId(run.id)}
              style={{
                display: "grid", gridTemplateColumns: "90px 1fr 100px 80px 90px",
                gap: "8px", padding: "14px 10px", alignItems: "center",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                background: selectedId === run.id ? "var(--surface)" : "transparent",
                position: "relative",
              }}
            >
              {selectedId === run.id && (
                <span style={{
                  position: "absolute", left: 0, top: 10, bottom: 10,
                  width: 2, background: "var(--accent)",
                }} />
              )}

              <span className="mono tnum" style={{ fontSize: 11, color: "var(--fg-3)" }}>{run.article_id}</span>

              <div style={{ minWidth: 0 }}>
                <div className="title-serif" style={{
                  fontSize: 17, color: "var(--fg)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {run.article_title}
                </div>
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${run.readiness_pct}%`, background: progressColor(run.status) }} />
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: "var(--fg-4)", width: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {run.step_label}
                  </span>
                </div>
              </div>

              <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)" }}>ARTICLE</span>

              <Chip tone={STATUS_TONE[run.status]}>{run.status_label}</Chip>

              <span className="mono tnum" style={{ fontSize: 10, color: "var(--fg-4)", textAlign: "right" }}>
                {formatRelative(run.updated_at)}
              </span>
            </div>
          ))
        )}

        <div style={{
          marginTop: 40, display: "flex", justifyContent: "space-between",
          fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--fg-5)",
          letterSpacing: "0.12em", textTransform: "uppercase",
        }}>
          <span>MBEditor &middot; Read-only Control Room</span>
          <span>{payload ? `/api/v1/runs · ${payload.capabilities.data_source}` : "/api/v1/runs"}</span>
        </div>
      </div>

      <DetailPanel run={active} notice={notice} loading={loading} onRefresh={() => void loadRuns()} go={go} />
    </div>
  );
}
