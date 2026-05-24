"use client";

import { useEffect } from "react";
import { setLastCategory } from "@/lib/storage";
import type { CategoryId } from "@/types";

export default function VisitTracker({ id }: { id: string }) {
  useEffect(() => {
    setLastCategory(id as CategoryId);
  }, [id]);
  return null;
}
