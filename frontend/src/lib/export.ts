import type { ArticleFull, LegacyExportBundle } from "@/types";

const EXPORT_VERSION = 1;

/**
 * Export articles to JSON bundle.
 */
export function exportToJson(articles: ArticleFull[]): string {
  const bundle: LegacyExportBundle = {
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    articles,
    mbdocs: [],
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * Trigger browser download of JSON export.
 */
export function downloadExport(articles: ArticleFull[], filename?: string): void {
  const json = exportToJson(articles);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `mbeditor-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parse imported JSON bundle.
 */
export function parseImportJson(json: string): LegacyExportBundle {
  const data = JSON.parse(json);
  if (data.version !== EXPORT_VERSION) {
    throw new Error(`Unsupported export version: ${data.version}`);
  }
  if (!Array.isArray(data.articles)) {
    throw new Error("Invalid export format: missing articles array");
  }
  return data as LegacyExportBundle;
}

/**
 * Import articles from JSON bundle, merging with existing articles.
 */
export function importFromJson(
  json: string,
  existingArticles: ArticleFull[]
): ArticleFull[] {
  const bundle = parseImportJson(json);
  const existingIds = new Set(existingArticles.map((a) => a.id));
  
  // Merge: add new articles, skip duplicates
  const newArticles = bundle.articles.filter((a) => !existingIds.has(a.id));
  return [...existingArticles, ...newArticles];
}