import Shell from "@/components/shell/Shell";
import ArticleList from "@/surfaces/article-list/ArticleList";
import EditorSurface from "@/surfaces/editor/EditorSurface";
import SettingsSurface from "@/surfaces/settings/SettingsSurface";
import Toast from "@/components/ui/Toast";
import { useArticlesStore } from "@/stores/articlesStore";
import type { Route } from "@/types";

export default function App() {
  const currentArticleId = useArticlesStore((state) => state.currentArticleId);

  return (
    <>
      <Shell>
        {(route: Route, params, navigation) => {
          switch (route) {
            case "list":
              return <ArticleList go={navigation.navigate} />;
            case "editor":
              return (
                <EditorSurface
                  articleId={params.articleId ?? currentArticleId ?? undefined}
                  go={navigation.navigate}
                  canGoBack={navigation.canGoBack}
                  onBack={navigation.goBack}
                />
              );
            case "settings":
              return <SettingsSurface go={navigation.navigate} />;
            default:
              return <ArticleList go={navigation.navigate} />;
          }
        }}
      </Shell>
      <Toast />
    </>
  );
}
