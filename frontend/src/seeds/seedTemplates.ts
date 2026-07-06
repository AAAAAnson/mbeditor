import type { ArticleFull } from "@/types";
import { getSeedArticles, REQUIRED_SEED_IDS } from "./index";

/**
 * 「起稿台」模板墙展示用的范文模板。
 *
 * 从全部 seed 中剔除强制灌库的 demo(`cdrive-cleanup`,是 REQUIRED_SEED_IDS 里
 * 用于版本同步的示例文,非「好看模板」),只留可「套用」的整篇范文。把这层筛选
 * 集中在此,HomeSurface 不再硬编码 `getSeedArticles().slice(0, 5)`(原 slice 实际
 * 误含 cdrive-cleanup,因它在 index 0)。
 */
export function getHomeTemplates(): ArticleFull[] {
  return getSeedArticles().filter((a) => !REQUIRED_SEED_IDS.has(a.id));
}
