"use client";

import { useEffect, useState } from "react";
import { isFavorite, subscribe, toggleFavorite } from "@/lib/storage";
import { track } from "@/lib/analytics";

export default function FavoriteButton({
  id,
  size = "md",
}: {
  id: string;
  size?: "sm" | "md" | "lg";
}) {
  const [fav, setFav] = useState(false);

  useEffect(() => {
    setFav(isFavorite(id));
    return subscribe(() => setFav(isFavorite(id)));
  }, [id]);

  const sizeMap = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  function handle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = toggleFavorite(id);
    setFav(next);
    if (next) track({ type: "favorite", wordId: id });
  }

  return (
    <button
      onClick={handle}
      aria-label={fav ? "取消收藏" : "加入收藏"}
      title={fav ? "取消收藏" : "加入收藏"}
      className={`${sizeMap[size]} inline-flex items-center justify-center rounded-full transition shadow-soft ${
        fav
          ? "bg-rose-100 text-rose-500 hover:bg-rose-200"
          : "bg-white text-muted hover:text-rose-500 hover:bg-rose-50"
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"}>
        <path
          d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
