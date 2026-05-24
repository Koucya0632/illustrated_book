"use client";

import { useEffect } from "react";
import { hydrateFromServer } from "@/lib/storage";

// Server-driven state hydration. Server (layout) reads the user's favorites
// and learned IDs from the DB, passes them here, and we mirror them into
// localStorage so the existing client UI (FavoriteButton, /favorites, /progress)
// works unchanged.
export default function HydrateUserState({
  favorites,
  learned,
}: {
  favorites: string[];
  learned: string[];
}) {
  useEffect(() => {
    hydrateFromServer(favorites, learned);
  }, [favorites, learned]);
  return null;
}
