import { useState, useEffect } from "react";

function fmtClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function useClock(): string {
  const [t, setT] = useState(() => fmtClock(new Date()));
  useEffect(() => {
    const id = setInterval(() => setT(fmtClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}
