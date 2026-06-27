import type { Metadata } from "next";
import FinishDeckToolClient from "./FinishDeckToolClient";

export const metadata: Metadata = {
  title: "Complete This Deck | ManaTap",
  description: "Use ManaTap AI to finish a partial Commander, Modern, Pioneer, Standard, or Pauper deck.",
  alternates: { canonical: "https://www.manatap.ai/tools/finish-deck" },
};

export default function FinishDeckToolPage() {
  return <FinishDeckToolClient />;
}
