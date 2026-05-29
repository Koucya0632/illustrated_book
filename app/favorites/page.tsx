import { getCurrentUserBundle } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { t } from "@/lib/i18n";
import FavoritesClient from "./FavoritesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的收藏 · Tuji" };

export default async function FavoritesPage() {
  const bundle = await getCurrentUserBundle();
  const settings = bundle ? await getSettings(bundle.user.id) : DEFAULT_SETTINGS;
  const tr = (key: string) => t(settings.uiLang, key);
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">{tr("progress.tile.favSub")}</div>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">{tr("fav.title")}</h1>
      <p className="mt-1 text-sm font-semibold text-tuji-ink3">{tr("fav.subtitle")}</p>
      <FavoritesClient />
    </div>
  );
}
