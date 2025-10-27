import type { Metadata } from "next";

export function canonicalMeta(path: string): Metadata {
  return { alternates: { canonical: path } };
}