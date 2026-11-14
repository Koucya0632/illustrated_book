"use client";

// 「大家拍的」 on a 景點 page: 物見 cards their owners shared to this spot.
//
// Fetched in the browser after the page loads, never rendered on the server:
// visitors see it, but the indexed page stays the official words — the same
// reason the 物見 pages themselves are noindex (user uploads no human has
// reviewed). Renders nothing until there is something to show.

import Link from "next/link";
import { useEffect, useState } from "react";

interface SharedCard {
  id: string;
  slug: string;
  lemma: string;
  displayZhHant: string;
  imageUrl: string | null;
  author: { handle: string; displayName: string } | null;
}

export default function PeopleShot({ spotId, title, lead }: { spotId: string; title: string; lead: string }) {
  const [cards, setCards] = useState<SharedCard[]>([]);

  useEffect(() => {
    let live = true;
    fetch(`/api/travel/spots/${encodeURIComponent(spotId)}/photos`)
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: SharedCard[] }) => {
        if (live) setCards(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [spotId]);

  if (cards.length === 0) return null;

  return (
    <section className="mt-10" data-nosnippet>
      <h2 className="font-display text-xl font-extrabold text-tuji-ink">{title}</h2>
      <p className="mt-1 text-sm text-tuji-ink3">{lead}</p>
      <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={`/atlas/public/${card.slug}`}
            rel="nofollow"
            className="overflow-hidden rounded-[18px] bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-cardHover"
          >
            <div className="aspect-square bg-tuji-bg">
              {card.imageUrl && (
                <img src={card.imageUrl} alt={card.lemma} loading="lazy" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="p-3">
              <p className="truncate text-base font-extrabold text-tuji-ink" lang="ja">
                {card.lemma}
              </p>
              <p className="truncate text-xs font-bold text-tuji-ink3">
                {card.displayZhHant}
                {card.author ? ` · ${card.author.displayName}` : ""}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
