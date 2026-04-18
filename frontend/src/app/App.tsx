import Shell from "@/components/shell/Shell";
import ArticleList from "@/surfaces/article-list/ArticleList";
import EditorSurface from "@/surfaces/editor/EditorSurface";
import AgentConsole from "@/surfaces/agent-console/AgentConsole";
import SettingsSurface from "@/surfaces/settings/SettingsSurface";
import Toast from "@/components/ui/Toast";
import { useArticlesStore } from "@/stores/articlesStore";
import type { Route } from "@/types";

export default function App() {
  const currentArticleId = useArticlesStore((state) => state.currentArticleId);

  return (
    <>
      <Shell>
        {(route: Route, params, navigate) => {
          switch (route) {
            case "list":
              return <ArticleList go={navigate} />;
            case "editor":
              return <EditorSurface articleId={params.articleId ?? currentArticleId ?? undefined} go={navigate} />;
            case "agent":
              return <AgentConsole go={navigate} />;
            case "settings":
              return <SettingsSurface go={navigate} />;
            default:
              return <ArticleList go={navigate} />;
          }
        }}
      </Shell>
      <Toast />
    </>
  );
}
