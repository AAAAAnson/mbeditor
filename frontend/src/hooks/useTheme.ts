import { useEffect } from "react";
import { useUIStore } from "@/stores/uiStore";

export function useTheme() {
  const theme = useUIStore((s) => s.theme);
  const fontFamily = useUIStore((s) => s.fontFamily);

  useEffect(() => {
    const html = document.documentElement;
    // light 是默认(:root,无属性);只有暖深 dark 设属性。
    if (theme === "dark") {
      html.setAttribute("data-theme", "dark");
    } else {
      html.removeAttribute("data-theme");
    }
  }, [theme]);

  useEffect(() => {
    const html = document.documentElement;
    // rounded is the default --f-sans (no attribute needed);
    // serif / system override --f-sans via [data-font] in index.css.
    html.removeAttribute("data-font");
    if (fontFamily === "serif") {
      html.setAttribute("data-font", "serif");
    } else if (fontFamily === "system") {
      html.setAttribute("data-font", "system");
    }
  }, [fontFamily]);
}
