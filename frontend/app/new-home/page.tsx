import type { Metadata } from "next";
import HybridHomePage from "@/components/home/HybridHomePage";

export const metadata: Metadata = {
  title: "New Homepage Preview | ManaTap AI",
  description:
    "Preview of the ManaTap hybrid homepage — deck building, budget upgrades, collection tools, game-night helpers, and AI assistance in one place.",
  robots: { index: false, follow: false },
};

export default function NewHomePage() {
  return <HybridHomePage />;
}
