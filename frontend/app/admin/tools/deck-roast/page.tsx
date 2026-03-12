"use client";

import DeckRoastPanel from "@/components/DeckRoastPanel";
import Link from "next/link";

export default function AdminDeckRoastPage() {
  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/justfordavy"
          className="text-neutral-400 hover:text-white text-sm"
        >
          ← Admin
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-white">AI Deck Roast (Admin Prototype)</h1>
      <p className="text-sm text-neutral-400">
        Pre-launch prototype. Test the roast flow before adding to homepage.
      </p>
      <DeckRoastPanel variant="panel" showSignupCta={false} />
    </main>
  );
}
