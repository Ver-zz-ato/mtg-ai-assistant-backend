import type { Metadata } from "next";
import PlaystyleQuizToolClient from "./PlaystyleQuizToolClient";

export const metadata: Metadata = {
  title: "MTG Playstyle Quiz | Commander & Constructed Deck Finder | ManaTap",
  description: "Take a Magic: The Gathering playstyle quiz for Commander, Modern, Pioneer, Standard, or Pauper and hand your result to ManaTap deck builders.",
  keywords: [
    "MTG playstyle quiz",
    "Magic deck quiz",
    "Commander playstyle quiz",
    "MTG deck recommendation quiz",
    "Modern deck quiz",
    "Pioneer deck quiz",
  ],
  alternates: { canonical: "https://www.manatap.ai/tools/playstyle-quiz" },
  openGraph: {
    title: "MTG Playstyle Quiz | ManaTap",
    description: "Find your MTG deckbuilding style and open the right ManaTap builder with your result prefilled.",
    url: "https://www.manatap.ai/tools/playstyle-quiz",
    siteName: "ManaTap",
    type: "website",
  },
};

export default function PlaystyleQuizToolPage() {
  return <PlaystyleQuizToolClient />;
}
