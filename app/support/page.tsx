import type { Metadata } from "next";
import Link from "next/link";
import PublicShell from "@/components/marketing/PublicShell";
import Mascot from "@/components/tuji/Mascot";

export const metadata: Metadata = {
  title: "Support · Tuji",
  description:
    "Contact Tuji support, get help with a Tuji Pro subscription, and learn how to request account deletion.",
};

export default function SupportPage() {
  return (
    <PublicShell>
      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
        <div>
          <div className="inline-flex items-center gap-2 border-l-3 border-tuji-current bg-tuji-paper2 py-1.5 pl-3 pr-3.5 text-[13px] font-bold uppercase tracking-[0.04em] text-tuji-ink2">
            Support
          </div>
          <h1 className="mt-5 text-5xl font-extrabold leading-[0.98] tracking-tight text-tuji-ink sm:text-6xl">
            We can help with your Tuji account.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-tuji-ink2">
            For support, privacy requests, billing questions, or account deletion help, contact
            the Tuji operator by email.
          </p>
          <a
            href="mailto:nexflow0632@gmail.com"
            className="mt-8 inline-flex bg-tuji-current px-6 py-4 text-base font-extrabold text-tuji-ink transition duration-120 hover:bg-tuji-currentDeep"
          >
            nexflow0632@gmail.com
          </a>
          {/* Sign in with Apple hides the real address behind a private relay,
              so the inbox someone writes from usually matches no account. The
              UID is the only identifier that always resolves — and in-app
              feedback carries it automatically. */}
          <p className="mt-5 max-w-xl text-sm leading-6 text-tuji-ink2">
            Fastest route for anything account- or subscription-related: send it from inside the
            app (我的 → 意見回饋). That way your account is attached automatically. If you email
            instead, please include your Tuji UID — find it under 我的 → 編輯個人檔案. Without it we
            often cannot match your message to an account, because Sign in with Apple hides your
            real address from us.
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-tuji-paper2 p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-end justify-center overflow-hidden bg-tuji-paper">
                <Mascot pose="wave" size={82} />
              </div>
              <div>
                <div className="text-[13px] font-bold uppercase tracking-[0.04em] text-tuji-ink3">
                  Account deletion
                </div>
                <h2 className="text-2xl font-extrabold tracking-tight text-tuji-ink">
                  Delete your account
                </h2>
              </div>
            </div>
            <div className="mt-6 space-y-4 text-sm leading-7 text-tuji-ink2">
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
              <Link href="/privacy" className="bg-tuji-ink px-5 py-3 text-center text-sm font-bold text-tuji-paper">
                Privacy Policy
              </Link>
              <Link href="/terms" className="bg-tuji-paper3 px-5 py-3 text-center text-sm font-bold text-tuji-ink2">
                Terms of Service
              </Link>
            </div>
          </div>

          <div className="bg-tuji-paper2 p-6">
            <div className="text-[13px] font-bold uppercase tracking-[0.04em] text-tuji-ink3">
              Subscription &amp; billing
            </div>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-tuji-ink">Tuji Pro</h2>
            <div className="mt-5 space-y-4 text-sm leading-7 text-tuji-ink2">
              <p>
                Tuji Pro is an auto-renewable subscription sold through the App Store. It is
                currently offered in four lengths — 1 month, 3 months, 6 months, and 1 year. Prices
                are shown in the App Store for your region.
              </p>
              <p>
                Billing, renewal, cancellation, and refunds are handled by Apple. Cancel or switch
                plans in your Apple account settings; we cannot cancel or refund a subscription on
                your behalf.
              </p>
              <p>
                New device, or reinstalled the app? Open 設定 → Tuji Pro → 恢復購買 to restore your
                subscription. One App Store subscription unlocks Pro on one Tuji account at a
                time — restoring it on another account moves the entitlement there.
              </p>
              {/* Same reasoning as the UID note above: a payment receipt does not
                  identify the Tuji account that should have been unlocked. */}
              <p>
                Paid but still not unlocked? Send it from 我的 → 意見回饋 inside the app so your
                account comes attached, or email us with your Tuji UID.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
