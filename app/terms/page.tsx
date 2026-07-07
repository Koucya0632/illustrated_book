import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import PublicShell from "@/components/marketing/PublicShell";
import MarkdownDocument from "@/components/marketing/MarkdownDocument";

export const metadata: Metadata = {
  title: "Terms of Service · Tuji",
  description: "Tuji Terms of Service.",
};

export default function TermsPage() {
  const source = fs.readFileSync(
    path.join(process.cwd(), "content/legal/TERMS_OF_SERVICE.md"),
    "utf8",
  );

  return (
    <PublicShell>
      <MarkdownDocument source={source} />
    </PublicShell>
  );
}
