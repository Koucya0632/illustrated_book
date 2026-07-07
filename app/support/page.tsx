import type { Metadata } from "next";
import Link from "next/link";
import PublicShell from "@/components/marketing/PublicShell";
import Mascot from "@/components/tuji/Mascot";

export const metadata: Metadata = {
  title: "Support · Tuji",
  description: "Contact Tuji support and learn how to request account deletion.",
};

export default function SupportPage() {
  return (
    <PublicShell>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-7 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-tuji-tealS px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-tuji-teal">
            Support
          </div>
          <h1 className="mt-5 text-5xl font-extrabold leading-[0.98] tracking-tight text-tuji-ink sm:text-6xl">
            We can help with your Tuji account.
          </h1>
          <p className="mt-5 max-w-xl text-lg font-semibold leading-8 text-tuji-ink2">
            For support, privacy requests, billing questions, or account deletion help, contact
            the Tuji operator by email.
          </p>
          <a
            href="mailto:nexflow0632@gmail.com"
            className="mt-8 inline-flex rounded-2xl bg-tuji-yellow px-6 py-4 text-base font-extrabold text-tuji-ink shadow-soft transition hover:shadow-card"
          >
            nexflow0632@gmail.com
          </a>
        </div>

        <div className="rounded-[28px] bg-white p-6 shadow-card">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-end justify-center overflow-hidden rounded-3xl bg-tuji-tealS">
              <Mascot pose="wave" size={82} />
            </div>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                Account deletion
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-tuji-ink">
                Delete your account
              </h2>
            </div>
          </div>
          <div className="mt-6 space-y-4 text-sm font-semibold leading-7 text-tuji-ink2">
            <p>
              You can delete your account from inside the app where the feature is available.
              You may also contact support and request account deletion.
            </p>
            <p>
              Account deletion is intended to remove account-linked data such as profile
              information, learning progress, private Atlas images, settings, push tokens, and
              custom content, except where retention is required or permitted for legal,
              security, billing, backup, dispute resolution, or moderation purposes.
            </p>
            <p>
              App Store subscriptions are managed by Apple. Deleting your Tuji account does not
              automatically cancel an App Store subscription.
            </p>
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/privacy" className="rounded-2xl bg-tuji-ink px-5 py-3 text-center text-sm font-extrabold text-white">
              Privacy Policy
            </Link>
            <Link href="/terms" className="rounded-2xl bg-tuji-tealS px-5 py-3 text-center text-sm font-extrabold text-tuji-teal">
              Terms of Service
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
