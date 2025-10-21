// app/my-decks/page.tsx
import { canonicalMeta } from "@/lib/canonical";
import type { Metadata } from "next";
import MyDecksClientPage from "./ClientPage";

export function generateMetadata(): Metadata {
  return canonicalMeta("/my-decks");
}

export default function Page() {
  return <MyDecksClientPage />;
}
