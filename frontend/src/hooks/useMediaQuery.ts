import { useEffect, useState } from "react";

/** 单一移动断点:全 app「<600px 转 X」共用此阈值,别各判一次。 */
export const MOBILE_QUERY = "(max-width: 600px)";

/** 订阅一条 CSS 媒体查询,返回当前是否命中。SSR / 无 matchMedia 时兜底 false。 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** 视口是否处于移动态(≤600px)。 */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
