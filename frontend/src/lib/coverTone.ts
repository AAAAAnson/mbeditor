/**
 * 单一封面/缩略图取色源。原本 HomeSurface(TILE_TONES)与 ArticleGrid(COVER_VARIANTS)
 * 各抄一份完全相同的表 —— 收敛到这里,避免双系统漂移(spec §9 模板系统统一去重)。
 * 色值保持与原表一致(纯去重,不重新上色)。
 */
export type CoverVariant = "warm" | "terminal" | "paper" | "neon" | "earth" | "swiss";

export interface CoverTone {
  from: string;
  to: string;
  stripe: string;
}

export const COVER_TONES: Record<CoverVariant, CoverTone> = {
  warm: { from: "#C14A3A", to: "#8A3B2E", stripe: "#D97860" },
  terminal: { from: "#1A1714", to: "#2A2225", stripe: "#C4A76C" },
  paper: { from: "#F0E8D8", to: "#C4A76C", stripe: "#8A6D5B" },
  neon: { from: "#7588B8", to: "#3D3730", stripe: "#C4A76C" },
  earth: { from: "#8A6D5B", to: "#C89458", stripe: "#F0E8D8" },
  swiss: { from: "#141013", to: "#302629", stripe: "#F0E8D8" },
};

export const COVER_KEYS = Object.keys(COVER_TONES) as CoverVariant[];

function fallbackKey(index: number): CoverVariant {
  const n = COVER_KEYS.length;
  return COVER_KEYS[((index % n) + n) % n];
}

/** Resolve a cover key to its variant name; unknown/empty keys fall back by index. */
export function coverVariantKey(key: string | undefined, index: number): CoverVariant {
  if (key && key in COVER_TONES) return key as CoverVariant;
  return fallbackKey(index);
}

/** Resolve a cover key to its gradient tone; unknown/empty keys fall back by index. */
export function coverTone(key: string | undefined, index: number): CoverTone {
  return COVER_TONES[coverVariantKey(key, index)];
}
