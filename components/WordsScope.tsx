import "server-only";
import { WordsProvider } from "./WordsProvider";
import { getAllCardWords } from "@/lib/data";
import { getCurrentUserBundle } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";

// Supplies the word catalogue to the routes that actually read it.
//
// This used to live in the root layout, which meant every page shipped all 478
// word objects — id, word, chinese, imageUrl, category, pronunciation — in its
// HTML. On the public marketing page that was ~295KB of a 376KB document, 78%
// of the bytes, for data the page never touches.
//
// `useWords()` has five consumers (/cards, /favorites, /progress, /search,
// /study) and each opts in via its own `layout.tsx`. The fetch is here rather
// than copied into all five so the settings derivation stays in one place;
// `getAllCardWords` is `unstable_cache`d and `getCurrentUserBundle` is
// React-`cache`d, so opting in costs a route nothing extra per request.
export default async function WordsScope({ children }: { children: React.ReactNode }) {
  const bundle = await getCurrentUserBundle();
  const settings = bundle ? await getSettings(bundle.user.id) : DEFAULT_SETTINGS;
  const words = await getAllCardWords(settings.uiLang, settings.learningDirection);
  return <WordsProvider words={words}>{children}</WordsProvider>;
}
