import { notFound } from "next/navigation";
import { getById } from "@/lib/words-db";
import WordForm from "../../WordForm";

export const dynamic = "force-dynamic";

export default async function EditWordPage({
  params,
}: {
  params: { id: string };
}) {
  const w = await getById(params.id);
  if (!w) notFound();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-ink">編輯：{w.word}</h1>
      <p className="text-sm text-muted mt-1">
        id <code className="font-mono">{w.id}</code>
      </p>
      <div className="mt-6">
        <WordForm mode="edit" initial={w} />
      </div>
    </div>
  );
}
