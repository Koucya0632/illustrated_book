"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

// Drop into a server page to log a single 'view' event on mount.
export default function EventTracker({
  wordId,
  category,
}: {
  wordId?: string;
  category?: string;
}) {
  useEffect(() => {
    track({ type: "view", wordId, category });
  }, [wordId, category]);
  return null;
}
