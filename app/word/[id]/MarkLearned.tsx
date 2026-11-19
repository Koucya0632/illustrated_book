"use client";

import { useEffect } from "react";
import { markLearned } from "@/lib/storage";

export default function MarkLearned({ id, signedIn }: { id: string; signedIn: boolean }) {
  useEffect(() => {
    markLearned(id, signedIn);
  }, [id, signedIn]);
  return null;
}
