import Link from "next/link";

export default function GoogleButton({
  next,
  label = "用 Google 繼續",
}: {
  next: string;
  label?: string;
}) {
  return (
    <Link
      href={`/api/auth/google?next=${encodeURIComponent(next)}`}
      className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-full bg-white text-ink font-medium shadow-card hover:shadow-lg border border-black/5 transition"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.62z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.46-.81 5.95-2.18l-2.9-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 009 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.71A5.41 5.41 0 013.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.04l3.01-2.33z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 009 0 9 9 0 00.96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
        />
      </svg>
      <span>{label}</span>
    </Link>
  );
}
