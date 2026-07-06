import type { ArticleFull } from "@/types";
import bizMinimal from "./tpl_biz_minimal.json";
import literary from "./tpl_literary.json";
import magazine from "./tpl_magazine.json";
import techNeon from "./tpl_tech_neon.json";
import vibrant from "./tpl_vibrant.json";
import cdriveCleanup from "./tpl_cdrive_cleanup.json";

type SeedRaw = {
  id: string;
  title: string;
  mode: string;
  html: string;
  css: string;
  js: string;
  markdown: string;
  cover: string;
  author: string;
  digest: string;
};

const RAW_SEEDS: SeedRaw[] = [cdriveCleanup, bizMinimal, literary, magazine, techNeon, vibrant];

function normalize(raw: SeedRaw): ArticleFull {
  const ts = new Date().toISOString();
  return {
    id: raw.id,
    title: raw.title,
    mode: raw.mode === "markdown" ? "markdown" : "html",
    cover: raw.cover || "",
    created_at: ts,
    updated_at: ts,
    html: raw.html || "",
    css: raw.css || "",
    js: raw.js || "",
    markdown: raw.markdown || "",
    author: raw.author || "",
    digest: raw.digest || "",
  };
}

export function getSeedArticles(): ArticleFull[] {
  return RAW_SEEDS.map(normalize);
}

export const SEED_VERSION = 5;

/** Seed ids that must exist AND be up-to-date in every user's storage.
 *  When ``SEED_VERSION`` bumps, existing articles with these ids get
 *  force-overwritten with the latest seed content (not just added if missing).
 *  Bump ``SEED_VERSION`` to trigger the re-sync on next rehydrate. */
export const REQUIRED_SEED_IDS = new Set<string>(["cdrive-cleanup"]);

/** Filter the full seed list down to ones that should be force-synced into an
 *  already-seeded store. Anything not in ``REQUIRED_SEED_IDS`` is left to the
 *  first-time seed path. */
export function getRequiredSeedArticles(): ArticleFull[] {
  return getSeedArticles().filter((a) => REQUIRED_SEED_IDS.has(a.id));
}
