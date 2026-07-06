import { useEffect, useMemo } from "react";
import ComposeSurface from "@/surfaces/compose/ComposeSurface";
import HomeSurface from "@/surfaces/home/HomeSurface";
import Shell from "@/components/shell/Shell";
import EditorSurface from "@/surfaces/editor/EditorSurface";
import SettingsSurface from "@/surfaces/settings/SettingsSurface";
import Toast from "@/components/ui/Toast";
import { selectLiveArticles, useArticlesStore } from "@/stores/articlesStore";
import {
  buildArticleSlug,
  findArticleBySlugSuffix,
  parseArticleSlugSuffix,
  persistEditorIntent,
  resolveEditorIntent,
} from "@/lib/route";
import type { Route } from "@/types";

export default function App() {
  // 启动接线:挂载后拉一次后端文章列表(merge 本地缓存 + 触发补同步)。
  // App 只挂载一次,路由切换发生在 Shell 的 render-prop 内部,不会重复触发;
  // 经 getState() 取 action,不订阅 store、不进依赖数组。
  useEffect(() => {
    void useArticlesStore.getState().fetchArticles();
  }, []);

  const currentArticleId = useArticlesStore((state) => state.currentArticleId);
  const allArticles = useArticlesStore((state) => state.articles);
  // slug 匹配只认活文章:软删的文章不该被路由到(回收站恢复后自然可达)。
  const articles = useMemo(() => selectLiveArticles({ articles: allArticles }), [allArticles]);

  return (
    <>
      <Shell>
        {(route: Route, params, navigation) => {
          // `list` is the single home surface (merged welcome + article list).
          // The retired `welcome` route is mapped to `list` by the router
          // (lib/route.ts), so it never reaches this switch as its own branch.
          if (route === "list" || route === "welcome") {
            return <HomeSurface go={navigation.navigate} />;
          }
          if (route === "settings") {
            return <SettingsSurface go={navigation.navigate} initialSection={params.section} />;
          }
          if (route === "compose") {
            return <ComposeSurface go={navigation.navigate} />;
          }

          // Editor route. Resolve the slug from the URL down to an
          // articleId, then keep the slug in sync if the title is renamed
          // mid-session.
          const slug = params.articleSlug;
          let articleId: string | undefined = currentArticleId ?? undefined;
          if (slug) {
            const suffix = parseArticleSlugSuffix(slug);
            const match = suffix ? findArticleBySlugSuffix(articles, suffix) : null;
            if (match) articleId = match.id;
          }
          // intent 三兜底:params(刚 pushState 进来,最权威)→ history.state
          // (同一 entry 刷新后浏览器保留)→ sessionStorage(绑 articleId 的额外
          // 持久,兜 history.state 丢失的场景)。resolve 是纯读;持久化交给下面
          // 的一次性 effect,避免每次 re-render 把已消费的 intent 又写回去。
          const intent = resolveEditorIntent(articleId, params.intent);
          return (
            <>
              <UrlSlugSync articleId={articleId} currentSlug={slug ?? ""} replaceParams={navigation.replaceParams} />
              <EditorIntentPersist articleId={articleId} paramIntent={params.intent} />
              <EditorSurface
                articleId={articleId}
                go={navigation.navigate}
                canGoBack={navigation.canGoBack}
                intent={intent}
              />
            </>
          );
        }}
      </Shell>
      <Toast />
    </>
  );
}

// Keeps the editor's URL slug in sync with the active article's current
// title. Title renames mutate the store; this component watches the
// resolved article and pushes a replaceState if the URL is stale.
function UrlSlugSync({
  articleId,
  currentSlug,
  replaceParams,
}: {
  articleId: string | undefined;
  currentSlug: string;
  replaceParams: (params: Record<string, string>) => void;
}) {
  const article = useArticlesStore((state) =>
    articleId ? state.articles.find((a) => a.id === articleId) : undefined,
  );
  const desiredSlug = article ? buildArticleSlug(article.title, article.id) : "";

  useEffect(() => {
    if (!desiredSlug || desiredSlug === currentSlug) return;
    replaceParams({ articleSlug: desiredSlug });
  }, [desiredSlug, currentSlug, replaceParams]);

  return null;
}

// Persists a *live* (from-URL-params) editor intent into sessionStorage exactly
// once per (article, intent). The pushState that brought us here already carries
// intent in history.state; this mirror is the belt-and-suspenders channel for
// environments where history.state is lost on reload. We only mirror the live
// param — never an intent recovered from storage — so a consumed intent that's
// been cleared by EditorSurface can't be re-seeded here on a later re-render.
function EditorIntentPersist({
  articleId,
  paramIntent,
}: {
  articleId: string | undefined;
  paramIntent: string | undefined;
}) {
  useEffect(() => {
    if (!articleId || !paramIntent) return;
    persistEditorIntent(articleId, paramIntent);
  }, [articleId, paramIntent]);

  return null;
}
