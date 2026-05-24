import ProgressClient from "./ProgressClient";

export default function ProgressPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-ink">學習進度 📈</h1>
      <p className="text-sm text-muted mt-1">看看你已經走多遠了。</p>
      <ProgressClient />
    </div>
  );
}
