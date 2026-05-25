import type { Metadata } from "next";
import Link from "next/link";
import ScanQrClient from "@/components/share/ScanQrClient";

export const metadata: Metadata = {
  title: "Scan QR Code | ManaTap Tools",
  description: "Scan or paste ManaTap share links for decks, collections, wishlists, cards, roasts, and reports.",
  alternates: { canonical: "https://www.manatap.ai/tools/scan-qr" },
};

export default function ScanQrPage() {
  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="mb-4 text-sm text-neutral-400">
        <Link href="/" className="hover:text-white">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/tools" className="hover:text-white">Tools</Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-200">Scan QR</span>
      </nav>
      <ScanQrClient />
    </main>
  );
}
