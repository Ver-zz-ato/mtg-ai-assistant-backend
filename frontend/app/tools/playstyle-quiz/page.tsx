import type { Metadata } from "next";
import PlaystyleQuizToolClient from "./PlaystyleQuizToolClient";

export const metadata: Metadata = {
  title: "MTG Playstyle Quiz | ManaTap",
  description: "Find your Commander or constructed MTG playstyle and hand it off to ManaTap deck builders.",
  alternates: { canonical: "https://www.manatap.ai/tools/playstyle-quiz" },
};

export default function PlaystyleQuizToolPage() {
  return <PlaystyleQuizToolClient />;
}
