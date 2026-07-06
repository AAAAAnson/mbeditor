// Debounced WeChat validator hook.
//
// Runs on every article-html change. Waits 500ms after the last keystroke
// before hitting ``/wechat/validate`` so large articles do not thrash the
// backend. In-flight requests are cancelled via ``AbortController`` when
// the html changes again or the hook unmounts — both prevent stale
// state from overwriting the current report.
//
// Never throws. Validator failures surface as ``running=false`` with the
// previous report preserved, plus an ``error`` string for callers that
// want to show a subtle "校验服务不可用" toast.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  validateWechatHtml,
  type ValidationIssue,
  type ValidationReport,
  type ValidationWarning,
} from "@/lib/wechat-validate";

const EMPTY_STATS = {
  svg_count: 0,
  animate_count: 0,
  animate_transform_count: 0,
  set_count: 0,
  anchor_count: 0,
};

const EMPTY_REPORT: ValidationReport = {
  issues: [],
  warnings: [],
  stats: EMPTY_STATS,
};

export interface UseWechatLintOptions {
  /** Milliseconds of idle time before a request is dispatched. Default 500. */
  debounceMs?: number;
  /** When false, the hook does nothing and returns an empty report. */
  enabled?: boolean;
}

export interface UseWechatLintResult {
  report: ValidationReport;
  issues: ValidationIssue[];
  warnings: ValidationWarning[];
  running: boolean;
  error: string | null;
  /** Monotonic counter incremented on every successful run (handy for tests). */
  runCount: number;
}

export function useWechatLint(
  html: string,
  options: UseWechatLintOptions = {},
): UseWechatLintResult {
  const { debounceMs = 500, enabled = true } = options;

  const [report, setReport] = useState<ValidationReport>(EMPTY_REPORT);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runCount, setRunCount] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setReport(EMPTY_REPORT);
      setRunning(false);
      setError(null);
      return;
    }

    // Empty html = empty report, no network call.
    if (!html || !html.trim()) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setReport(EMPTY_REPORT);
      setRunning(false);
      setError(null);
      return;
    }

    // Cancel previous pending run, if any.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    timerRef.current = setTimeout(() => {
      // Cancel any in-flight request before kicking a new one.
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);

      void validateWechatHtml(html, { signal: controller.signal }).then((result) => {
        // If another run superseded us mid-flight, ignore the answer.
        if (abortRef.current !== controller) return;
        abortRef.current = null;

        if (result.ok) {
          setReport(result.report);
          setError(null);
          setRunCount((prev) => prev + 1);
        } else if (result.error !== "aborted") {
          setError(result.error);
        }
        setRunning(false);
      });
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [html, debounceMs, enabled]);

  // On unmount: cancel any in-flight fetch. Separate effect so the
  // cleanup only fires once (the above cleanup runs on every html
  // change).
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return useMemo(
    () => ({
      report,
      issues: report.issues,
      warnings: report.warnings,
      running,
      error,
      runCount,
    }),
    [report, running, error, runCount],
  );
}
