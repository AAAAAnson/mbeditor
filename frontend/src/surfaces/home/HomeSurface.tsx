import type { ArticleFull, Route } from "@/types";
import {
  selectLiveArticles,
  selectTrashedArticles,
  useArticlesStore,
} from "@/stores/articlesStore";
import { toast } from "@/stores/toastStore";
import { getHomeTemplates } from "@/seeds/seedTemplates";
import { coverTone } from "@/lib/coverTone";
import {
  IconArrowRight,
  IconBook,
  IconMic,
  IconPin,
  IconPlus,
  IconSparkle,
  IconStore,
  IconStroller,
  IconTrash,
} from "@/components/icons";
import { Dialog } from "@/components/ui";
import { ArticleGrid, type ArticleRow } from "@/surfaces/article-list/ArticleGrid";
import TrashPanel from "@/surfaces/article-list/TrashPanel";
import { buildArticleSlug } from "@/lib/route";
import { clearStoredDraft } from "@/lib/draftKey";
import { EMPTY_ANSWERS, saveDraft } from "@/surfaces/compose/composeDraft";
import { useArticleCreators } from "./useArticleCreators";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useMemo, useRef, useState } from "react";

interface HomeSurfaceProps {
  go?: (route: Route, params?: Record<string, string>) => void;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "请求失败";
}

const HOME_CAPSULES = [
  {
    label: "带娃日记",
    seed: "今天带娃去公园，他第一次自己荡秋千，想写成一篇温柔的成长记录。",
    Icon: IconStroller,
  },
  {
    label: "闲读笔记",
    seed: "读完一本书，里面有一句话让我停了很久，想写成一篇闲读笔记。",
    Icon: IconBook,
  },
  {
    label: "上新笔记",
    seed: "这周有一个新品上架，想写清楚它适合谁、解决什么问题、为什么值得试试。",
    Icon: IconStore,
  },
  {
    label: "本地探店",
    seed: "周末去了一家小店，环境和服务都很舒服，想写成一篇真实的探店推荐。",
    Icon: IconPin,
  },
] as const;

/**
 * Home — the single landing surface that merges the old welcome + list views.
 *
 * Renders *below* the Shell TopBar (it never draws its own top bar). The hero
 * (sticky) always offers the three paths: AI compose, use-template, blank.
 * Below it, the body branches on `articles.length` — NOT on `firstVisit`:
 *   - 0 articles → template wall (onboarding for empty users)
 *   - ≥1 article → recent-articles ArticleGrid
 * Driving on `articles.length` avoids the first-frame race where the rehydrate
 * `firstVisit` flag lands a microtask late (articlesStore.ts:161). `firstVisit`
 * is read-only here and only nudges the onboarding copy.
 */
export function HomeSurface({ go = () => {} }: HomeSurfaceProps) {
  const allArticles = useArticlesStore((state) => state.articles);
  // 展示只看活文章:软删的进回收站(批3 UI),不出现在首页网格/空态判定里。
  const articles = useMemo(() => selectLiveArticles({ articles: allArticles }), [allArticles]);
  // 回收站入口挂在 Home(唯一可达的落地 surface;ArticleList 是孤儿组件)。
  const trashed = useMemo(() => selectTrashedArticles({ articles: allArticles }), [allArticles]);
  const [trashOpen, setTrashOpen] = useState(false);
  const firstVisit = useArticlesStore((state) => state.firstVisit);
  const deleteArticle = useArticlesStore((state) => state.deleteArticle);
  const setCurrentArticle = useArticlesStore((state) => state.setCurrentArticle);

  const { busy, handleUseTemplate, handleBlank } = useArticleCreators(go);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ArticleRow | null>(null);
  const [intentText, setIntentText] = useState("");
  const intentInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // 展示 5 套可套用范文模板(已剔除强制灌库的 cdrive-cleanup demo)。
  const templates = getHomeTemplates();
  const hasArticles = articles.length > 0;

  const openArticle = (article: ArticleRow) => {
    setCurrentArticle(article.id);
    go("editor", { articleSlug: buildArticleSlug(article.title, article.id) });
  };

  const requestDelete = (article: ArticleRow) => {
    if (deletingId) return;
    setConfirmDelete(article);
  };

  const confirmDeleteArticle = async () => {
    const article = confirmDelete;
    if (!article || deletingId) return;
    const displayTitle = article.title || "未命名文章";
    setConfirmDelete(null);
    setDeletingId(article.id);
    try {
      await deleteArticle(article.id);
      // 删文章后顺手清掉残留的草稿缓存(避免孤儿草稿)。
      clearStoredDraft(article.id);
      toast.success(`已删除「${displayTitle}」`);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  const fillIntent = (seed: string) => {
    setIntentText(seed);
    intentInputRef.current?.focus();
  };

  // 主 CTA / Enter 共用:认真打了一句话就带进 compose(写共享草稿,
  // ComposeSurface 会据此直跳 asking);空输入行为不变,直接进 compose。
  const startAiCompose = () => {
    const intent = intentText.trim();
    if (intent) {
      saveDraft({ ...EMPTY_ANSWERS, intent });
    }
    go("compose");
  };

  return (
    <div style={{ height: "100%", overflow: "auto", background: "var(--bg)" }}>
      {/* Hero — sticky so the primary CTA stays a thumb-reach away even after
          scrolling a long article list. Renders below the Shell TopBar. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 910, margin: "0 auto", padding: "44px 30px 30px" }}>
          <div style={{ marginBottom: 14 }}>
            <span className="label-soft" style={{ color: "var(--accent)" }}>
              AI 帮你写公众号
            </span>
          </div>
          <h1
            className="title-serif"
            style={{
              fontSize: "clamp(28px, 7vw, 48px)",
              margin: "0 0 12px",
              color: "var(--fg)",
              lineHeight: 1.1,
            }}
          >
            想写点什么呀？
            <span style={{ color: "var(--accent)", marginLeft: "-0.18em" }}>.</span>
          </h1>
          <p
            style={{
              margin: "0 0 28px",
              maxWidth: 480,
              color: "var(--fg-3)",
              fontSize: 15,
              lineHeight: 1.75,
              fontFamily: "var(--f-display)",
            }}
          >
            {firstVisit
              ? "第一次来呀~ 说一句你的想法，帮你写出一篇好看的公众号推文；也可以套个现成模板，或者从空白开始自己写。"
              : "说一句你的想法，帮你写出一篇好看的公众号推文；也可以套个现成模板，或者从空白开始自己写。"}
          </p>

          <div
            style={{
              display: "grid",
              gap: 10,
              maxWidth: 620,
              marginBottom: 18,
            }}
          >
            <label
              htmlFor="home-intent-input"
              className="label-soft"
              style={{ color: "var(--fg-3)" }}
            >
              先写一句想法
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 52,
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
                background: "var(--surface)",
                padding: "0 14px",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              <IconMic size={18} />
              <input
                id="home-intent-input"
                data-testid="home-intent-input"
                ref={intentInputRef}
                type="text"
                value={intentText}
                onChange={(event) => setIntentText(event.currentTarget.value)}
                onKeyDown={(event) => {
                  // Enter 提交(IME 组合态的 Enter 是选字,不算提交);空输入不动。
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                  if (!intentText.trim()) return;
                  event.preventDefault();
                  startAiCompose();
                }}
                disabled={busy}
                placeholder="比如: 今天带娃去公园，他第一次自己荡秋千..."
                style={{
                  width: "100%",
                  minWidth: 0,
                  border: 0,
                  outline: 0,
                  background: "transparent",
                  color: "var(--fg)",
                  font: "15px/1.5 var(--f-display)",
                }}
              />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {HOME_CAPSULES.map(({ label, seed, Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => fillIntent(seed)}
                  disabled={busy}
                  style={{
                    all: "unset",
                    cursor: busy ? "default" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    minHeight: 36,
                    padding: "0 12px",
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    color: "var(--fg-2)",
                    font: "12px/1 var(--f-display)",
                    opacity: busy ? 0.58 : 1,
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 三条路 CTA —— 等高组(.hero-ctas)统一 min-height + 垂直/水平居中,
              实心仍用更大字号保主次,但高度三态归一。 */}
          <div className="hero-ctas">
            <button
              type="button"
              className="btn btn-primary"
              onClick={startAiCompose}
              style={{ fontSize: 15, padding: "0 22px" }}
            >
              <IconSparkle size={15} /> 让 AI 帮我写 <IconArrowRight size={15} />
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => templates[0] && handleUseTemplate(templates[0])}
              disabled={busy}
            >
              套个好看模板
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleBlank} disabled={busy}>
              <IconPlus size={14} /> 自己写一篇
            </button>
          </div>
        </div>
      </div>

      {/* Body — recent articles, or the template wall when the store is empty. */}
      <div style={{ maxWidth: 910, margin: "0 auto", padding: "32px 30px 84px" }}>
        {hasArticles ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
              <span className="label-soft">最近的文章</span>
              <div className="hair-rule" style={{ flex: 1 }} />
              <span className="label-soft tnum">{articles.length} 篇</span>
            </div>
            <ArticleGrid
              articles={articles}
              onOpen={(article) => openArticle(article)}
              onDelete={(article) => requestDelete(article)}
              deletingId={deletingId}
            />
          </>
        ) : (
          <TemplateWall
            templates={templates}
            busy={busy}
            onUseTemplate={handleUseTemplate}
            isMobile={isMobile}
          />
        )}

        {/* 回收站入口:有软删文章时显示。放两分支之外,即使文章全删光也能进来恢复。 */}
        {trashed.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <button
              type="button"
              data-testid="trash-toggle"
              aria-expanded={trashOpen}
              className="btn btn-ghost btn-sm"
              onClick={() => setTrashOpen((v) => !v)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <IconTrash size={13} /> 回收站{" "}
              <span className="tnum" data-testid="trash-count">
                ({trashed.length})
              </span>
            </button>
            {trashOpen && <TrashPanel />}
          </div>
        )}
      </div>
      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="删除文章"
        icon={<IconTrash size={18} />}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={Boolean(deletingId)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void confirmDeleteArticle()}
              disabled={Boolean(deletingId)}
            >
              删除
            </button>
          </>
        }
      >
        <p style={{ margin: 0, color: "var(--fg-2)", lineHeight: 1.7 }}>
          把「{confirmDelete?.title || "未命名文章"}」移到回收站？可以随时在回收站恢复。
        </p>
      </Dialog>
    </div>
  );
}

interface TemplateWallProps {
  templates: ArticleFull[];
  busy: boolean;
  onUseTemplate: (seed: ArticleFull) => void;
  isMobile: boolean;
}

// 空 store 时引导用户的「模板墙」:点任意一张直接套用并进 editor。
function TemplateWall({ templates, busy, onUseTemplate, isMobile }: TemplateWallProps) {
  return (
    <div data-testid="home-template-wall">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
        <span className="label-soft">挑套好看模板开始</span>
        <div className="hair-rule" style={{ flex: 1 }} />
        <span className="label-soft tnum">{templates.length.toString().padStart(2, "0")} 套</span>
      </div>
      <div
        data-testid="home-template-grid"
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(auto-fill, minmax(min(100%, 200px), 1fr))",
          gap: "clamp(12px, 3vw, 18px)",
        }}
      >
        {templates.map((seed, index) => {
          const tone = coverTone(seed.cover, index);
          return (
            <button
              key={seed.id}
              type="button"
              onClick={() => onUseTemplate(seed)}
              disabled={busy}
              aria-label={`套用模板 ${seed.title}`}
              style={{
                all: "unset",
                cursor: busy ? "default" : "pointer",
                display: "block",
                borderRadius: "var(--r-xl)",
                overflow: "hidden",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                opacity: busy ? 0.6 : 1,
                boxShadow: "0 10px 24px -18px rgba(58,42,34,0.32)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(event) => {
                if (busy) return;
                event.currentTarget.style.transform = "translateY(-3px)";
                event.currentTarget.style.boxShadow = "0 16px 34px -16px rgba(214,90,50,0.34)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = "none";
                event.currentTarget.style.boxShadow = "0 10px 24px -18px rgba(58,42,34,0.32)";
              }}
            >
              <div
                style={{
                  height: 96,
                  background: `linear-gradient(135deg, ${tone.from}, ${tone.to})`,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 12px, ${tone.stripe}22 12px, ${tone.stripe}22 13px)`,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 10,
                    bottom: 10,
                    right: 10,
                    height: 5,
                    borderRadius: 1,
                    background: tone.stripe,
                    opacity: 0.85,
                  }}
                />
              </div>
              <div style={{ padding: "12px 14px 16px" }}>
                <div
                  className="title-serif"
                  style={{
                    fontSize: 15,
                    color: "var(--fg)",
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {seed.title}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default HomeSurface;
