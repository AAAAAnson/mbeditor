import type { ArticleFull, LegacyExportBundle } from "@/types";
import { useArticlesStore } from "@/stores/articlesStore";
import { useMBDocStore, type MBDocRecord } from "@/stores/mbdocStore";

export function parseLegacyBundle(raw: string): LegacyExportBundle {
  const parsed = JSON.parse(raw);
  if (parsed?.version !== 1) {
    throw new Error(`Unsupported bundle version: ${parsed?.version}`);
  }
  if (!Array.isArray(parsed.articles) || !Array.isArray(parsed.mbdocs)) {
    throw new Error("Bundle is missing articles or mbdocs arrays");
  }
  return parsed as LegacyExportBundle;
}

export async function readLegacyBundle(file: File): Promise<LegacyExportBundle> {
  const text = await file.text();
  return parseLegacyBundle(text);
}

export function applyLegacyBundle(bundle: LegacyExportBundle): void {
  const articles = bundle.articles as ArticleFull[];
  useArticlesStore.getState().replaceAll(articles);

  const docs: MBDocRecord[] = bundle.mbdocs.map((d) => ({ id: d.id, title: d.title, data: d.data }));
  useMBDocStore.getState().replaceAll(docs);
}
