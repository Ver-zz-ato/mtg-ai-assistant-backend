import type { Metadata } from "next";
import FinishDeckToolClient from "./FinishDeckToolClient";

export const metadata: Metadata = {
  title: "Complete This Deck | MTG Deck Completion Tool | ManaTap",
  description: "Use ManaTap AI to finish incomplete Commander, Modern, Pioneer, Standard, or Pauper decks from saved lists, pasted decklists, Moxfield links, or Archidekt links.",
  keywords: [
    "complete MTG deck",
    "finish Magic deck",
    "MTG deck completion",
    "Commander deck suggestions",
    "Moxfield deck suggestions",
    "Archidekt deck suggestions",
  ],
  alternates: { canonical: "https://www.manatap.ai/tools/finish-deck" },
  openGraph: {
    title: "Complete This Deck | ManaTap",
    description: "Finish incomplete MTG decks with format-aware AI card suggestions.",
    url: "https://www.manatap.ai/tools/finish-deck",
    siteName: "ManaTap",
    type: "website",
  },
};

export default function FinishDeckToolPage() {
  return <FinishDeckToolClient />;
}
