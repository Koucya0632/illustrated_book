import { notFound } from "next/navigation";
import QuizRunner from "./QuizRunner";
import type { QuizType } from "@/types";

const valid: QuizType[] = ["image", "chinese", "spelling"];

export function generateStaticParams() {
  return valid.map((t) => ({ type: t }));
}

export default function QuizTypePage({ params }: { params: { type: string } }) {
  if (!valid.includes(params.type as QuizType)) notFound();
  return <QuizRunner type={params.type as QuizType} />;
}
