import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import PublicShell from "@/components/marketing/PublicShell";
import MarkdownDocument from "@/components/marketing/MarkdownDocument";

export const metadata: Metadata = {
  title: "Privacy Policy · Tuji",
  description: "Tuji Privacy Policy.",
};

export default function PrivacyPage() {
  const source = fs.readFileSync(
    path.join(process.cwd(), "content/legal/PRIVACY_POLICY.md"),
    "utf8",
  );

  return (
    <PublicShell>
      <MarkdownDocument source={source} />
    </PublicShell>
  );
}
