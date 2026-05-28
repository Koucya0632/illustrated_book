"use client";

// Light-weight client analytics that POSTs to /api/events without blocking
// rendering. All calls are fire-and-forget.

const SESSION_KEY = "eepd-session-id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      (crypto?.randomUUID?.() ??
        Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 32);
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export interface TrackPayload {
  type: "view" | "favorite" | "quiz_attempt" | "pronounce";
  wordId?: string;
  category?: string;
  quizType?: "image" | "chinese" | "spelling";
  correct?: boolean;
}

export function track(payload: TrackPayload) {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ ...payload, sessionId: getSessionId() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/events",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* never break the app on analytics */
  }
}
