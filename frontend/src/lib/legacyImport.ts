import type { ArticleFull, LegacyExportBundle, MBDoc } from "@/types";
import { useArticlesStore } from "@/stores/articlesStore";
import { useMBDocStore } from "@/stores/mbdocStore";

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

  // Convert legacy mbdoc records to MBDoc format if possible
  const docs: MBDoc[] = bundle.mbdocs.map((d) => {
    if (d.data && typeof d.data === "object" && "blocks" in (d.data as object)) {
      return d.data as MBDoc;
    }
    // Fallback: create a minimal MBDoc from the legacy record
    return {
      id: d.id,
      version: "1" as const,
      meta: { title: d.title },
      blocks: [],
    };
  });
  useMBDocStore.getState().replaceAllLocal(docs);
}
