import WordForm from "../WordForm";

export const dynamic = "force-dynamic";

export default function NewWordPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-ink">新增單字</h1>
      <p className="text-sm text-muted mt-1">填完按「儲存」即可建立。</p>
      <div className="mt-6">
        <WordForm mode="create" />
      </div>
    </div>
  );
}
