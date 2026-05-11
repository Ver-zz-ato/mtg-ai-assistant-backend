import type { Metadata } from "next";
import { canonicalMeta as buildCanonicalMeta } from "@/lib/seo/metadata";

export function canonicalMeta(path: string, metadata: Metadata = {}): Metadata {
  return buildCanonicalMeta(path, metadata);
}
