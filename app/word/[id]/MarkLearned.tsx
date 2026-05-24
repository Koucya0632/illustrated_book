"use client";

import { useEffect } from "react";
import { markLearned } from "@/lib/storage";

export default function MarkLearned({ id }: { id: string }) {
  useEffect(() => {
    markLearned(id);
  }, [id]);
  return null;
}
