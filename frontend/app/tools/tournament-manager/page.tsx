import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canViewTournamentManager } from "@/lib/tournaments/visibility";
import TournamentManagerClient from "./TournamentManagerClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournament Manager | ManaTap Tools",
  description: "Host or join Magic: The Gathering tournaments with pairings, standings, deck submissions, results, and Commander pods.",
  alternates: { canonical: "https://www.manatap.ai/tools/tournament-manager" },
};

export default async function TournamentManagerPage({
  searchParams,
}: {
  searchParams?: Promise<{ tournamentToken?: string; token?: string; invite?: string }>;
}) {
  if (!(await canViewTournamentManager())) notFound();

  const params = await searchParams;
  const initialToken = params?.tournamentToken ?? params?.token ?? params?.invite ?? "";

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-[112rem] px-4 py-6 sm:px-6 lg:px-8">
        <nav className="mb-4 text-sm text-neutral-400">
          <Link href="/" className="rounded hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/tools" className="rounded hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70">
            Tools
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Tournament Manager</span>
        </nav>
        <TournamentManagerClient initialToken={initialToken} />
      </div>
    </main>
  );
}
