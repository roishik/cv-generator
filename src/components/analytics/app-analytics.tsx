"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { normalizeAnalyticsPath, sanitizeAnalyticsString } from "@/lib/analytics/meta";

type BrowserAnalyticsEvent = {
  kind: string;
  status?: "ok" | "warning" | "error";
  path?: string;
  action?: string;
  category?: string;
  value?: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
};

const ENDPOINT = "/api/analytics/events";
const SESSION_KEY = "tailor.analytics.sessionId";

function getSessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    window.localStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return "session-unavailable";
  }
}

function viewportSize(): "mobile" | "tablet" | "desktop" {
  if (window.innerWidth < 768) return "mobile";
  if (window.innerWidth < 1280) return "tablet";
  return "desktop";
}

function sendAnalytics(events: BrowserAnalyticsEvent[], beacon = false) {
  if (events.length === 0) return;
  const payload = JSON.stringify({ events });
  if (beacon && "sendBeacon" in navigator) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon(ENDPOINT, blob);
    return;
  }
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: payload.length < 8_000,
  }).catch(() => {
    /* analytics is best-effort */
  });
}

function closestTrackable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-analytics-action],button,a,[role='button']");
}

export function AppAnalytics() {
  const pathname = usePathname();
  const sessionIdRef = useRef<string | null>(null);
  const currentPathRef = useRef<string>("/");
  const enteredAtRef = useRef<number>(0);

  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  useEffect(() => {
    const now = performance.now();
    const nextPath = normalizeAnalyticsPath(pathname);
    const previousPath = currentPathRef.current;

    if (enteredAtRef.current > 0 && previousPath) {
      const durationMs = now - enteredAtRef.current;
      if (durationMs >= 1_000) {
        sendAnalytics([
          {
            kind: "screen_time",
            path: previousPath,
            durationMs,
            meta: { sessionId: sessionIdRef.current },
          },
        ]);
      }
    }

    currentPathRef.current = nextPath;
    enteredAtRef.current = now;
    sendAnalytics([
      {
        kind: "page_view",
        path: nextPath,
        meta: {
          sessionId: sessionIdRef.current,
          viewport: viewportSize(),
          previousPath: previousPath === nextPath ? undefined : previousPath,
        },
      },
    ]);
  }, [pathname]);

  useEffect(() => {
    const flushTime = (beacon: boolean) => {
      const now = performance.now();
      const durationMs = now - enteredAtRef.current;
      if (durationMs < 1_000) return;
      sendAnalytics(
        [
          {
            kind: "screen_time",
            path: currentPathRef.current,
            durationMs,
            meta: { sessionId: sessionIdRef.current },
          },
        ],
        beacon,
      );
      enteredAtRef.current = now;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushTime(true);
      if (document.visibilityState === "visible") enteredAtRef.current = performance.now();
    };
    const onPageHide = () => flushTime(true);
    const onClick = (event: MouseEvent) => {
      const el = closestTrackable(event.target);
      if (!el) return;
      const action =
        el.dataset.analyticsAction ??
        (el.tagName.toLowerCase() === "a" ? "link_click" : "button_click");
      const href = el instanceof HTMLAnchorElement ? normalizeAnalyticsPath(el.href) : undefined;
      sendAnalytics([
        {
          kind: "ui_click",
          path: currentPathRef.current,
          action,
          category: el.dataset.analyticsCategory ?? el.tagName.toLowerCase(),
          meta: {
            sessionId: sessionIdRef.current,
            href,
            role: el.getAttribute("role") ?? undefined,
          },
        },
      ]);
    };
    const onError = (event: ErrorEvent) => {
      sendAnalytics([
        {
          kind: "client_error",
          status: "error",
          path: currentPathRef.current,
          meta: {
            sessionId: sessionIdRef.current,
            errorType: event.error?.name ?? "ErrorEvent",
            message: sanitizeAnalyticsString(event.message),
          },
        },
      ]);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { name?: string; message?: string } | undefined;
      sendAnalytics([
        {
          kind: "client_error",
          status: "error",
          path: currentPathRef.current,
          meta: {
            sessionId: sessionIdRef.current,
            errorType: reason?.name ?? "UnhandledRejection",
            message: sanitizeAnalyticsString(reason?.message ?? "Promise rejection"),
          },
        },
      ]);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("click", onClick, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      flushTime(true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
