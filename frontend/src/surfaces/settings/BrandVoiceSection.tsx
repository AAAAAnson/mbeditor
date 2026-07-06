import { useEffect, useState } from "react";
import { toast } from "@/stores/toastStore";
import SectionHeader from "./SectionHeader";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Textarea";
import { Tag } from "@/components/ui/Tag";
import { IconMic, IconCheck, IconClock, IconSparkle, IconTrash } from "@/components/icons";
import { getVoice, learnVoice, clearVoice, type BrandVoice } from "./voiceApi";

function TraitRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.04em",
          color: "var(--ink-soft)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-strong)" }}>{children}</div>
    </div>
  );
}

/** 学过几篇 + 更新时间 → 友好元信息。后端只给 updated_at;篇数取摘录有无近似呈现。 */
function formatUpdated(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "1 天前";
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  return `${months} 个月前`;
}

export default function BrandVoiceSection() {
  const [loaded, setLoaded] = useState(false);
  const [voice, setVoice] = useState<BrandVoice | null>(null);
  const [sample, setSample] = useState("");
  const [learning, setLearning] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    getVoice()
      .then(setVoice)
      .finally(() => setLoaded(true));
  }, []);

  const handleLearn = async () => {
    const text = sample.trim();
    if (!text) return;
    setLearning(true);
    try {
      const learned = await learnVoice(text);
      setVoice(learned);
      setSample("");
      toast.success("音色已更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "学习失败");
    } finally {
      setLearning(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearVoice();
      setVoice(null);
      toast.success("已清空音色档案");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "清空失败");
    } finally {
      setClearing(false);
    }
  };

  const hasProfile = Boolean(loaded && voice && voice.traits);
  const updated = voice?.updated_at ? formatUpdated(voice.updated_at) : "";

  return (
    <div data-testid="brand-voice-section" style={{ maxWidth: 640 }}>
      <SectionHeader
        title="音色档案"
        eyebrow="写作 · 音色档案"
        eyebrowIcon={<IconMic size={13} />}
        sub="贴一篇你的旧文,AI 学一次你的语气要点并存在本部署后端,之后每篇都会按这套笔法生成。"
      />

      {/* ── 笔法特征 / 空态 ── */}
      <div className="ss-card">
        <div className="ss-cardhd">
          <IconMic size={17} />
          <span className="ct">{hasProfile ? "你的笔法特征" : "还没有音色档案"}</span>
          {hasProfile && (
            <>
              <span className="cgrow" />
              <button
                type="button"
                className="ss-pillopt"
                style={{ height: 32 }}
                onClick={handleClear}
                disabled={clearing}
              >
                <IconTrash size={14} />
                {clearing ? "清空中…" : "清空"}
              </button>
            </>
          )}
        </div>
        <div className="ss-cardbody">
          {hasProfile && voice && voice.traits ? (
            <div data-testid="voice-traits">
              <TraitRow label="语气">{voice.traits.tone || "—"}</TraitRow>
              <TraitRow label="节奏">{voice.traits.cadence || "—"}</TraitRow>
              <TraitRow label="标志措辞">
                {voice.traits.signatures.length ? (
                  <div className="ss-traits">
                    {voice.traits.signatures.map((s, i) => (
                      <Tag key={i} tone="orange" leading={<IconCheck size={12} />}>
                        {s}
                      </Tag>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </TraitRow>
              <TraitRow label="忌用词">
                {voice.traits.banned_words.length ? (
                  <div className="ss-traits">
                    {voice.traits.banned_words.map((s, i) => (
                      <Tag key={i} tone="danger">
                        {s}
                      </Tag>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </TraitRow>
              {(voice.source_excerpt || updated) && (
                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 12.5,
                    color: "var(--ink-soft)",
                  }}
                >
                  <IconClock size={13} />
                  学自旧文{updated ? ` · 更新于 ${updated}` : ""}
                </div>
              )}
              {voice.source_excerpt && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "var(--ink-faint)",
                    lineHeight: 1.6,
                  }}
                >
                  样本摘录:{voice.source_excerpt}
                </div>
              )}
            </div>
          ) : (
            loaded && (
              <div data-testid="voice-empty" className="ss-empty">
                <span className="ss-emptyico">
                  <IconMic size={26} />
                </span>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink-strong)" }}>
                  贴一篇旧文,我来学你的笔法
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-soft)", maxWidth: 360, lineHeight: 1.6 }}>
                  没有档案也能正常写,只是少了点「你的味道」。
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── 贴旧文,学笔法 ── */}
      <div className="ss-card">
        <div className="ss-cardhd">
          <IconSparkle size={17} />
          <span className="ct">贴旧文,学笔法</span>
        </div>
        <div className="ss-cardbody">
          <Field label="旧文样本">
            <Textarea
              aria-label="旧文样本"
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              placeholder="把你满意的一篇旧文整段贴这里…"
              rows={6}
            />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleLearn}
              disabled={!loaded || learning || !sample.trim()}
            >
              <IconSparkle size={15} />
              {learning ? "学习中…" : voice ? "重新学习" : "开始学习"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
