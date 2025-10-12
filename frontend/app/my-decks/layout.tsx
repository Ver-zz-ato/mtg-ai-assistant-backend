import { NOINDEX } from "@/lib/noindex";
import type { Metadata } from "next";

export const metadata: Metadata = NOINDEX;

export default function MyDecksLayout({ children }: { children: React.ReactNode }) {
  return children;
}