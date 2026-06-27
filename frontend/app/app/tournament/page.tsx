import Link from "next/link";
import { canViewTournamentManager } from "@/lib/tournaments/visibility";

export const dynamic = "force-dynamic";

export default async function TournamentInvitePage({
  searchParams,
}: {
  searchParams?: Promise<{ tournamentToken?: string; token?: string }>;
}) {
  const params = await searchParams;
  const canUseWebManager = await canViewTournamentManager();
  const token = params?.tournamentToken ?? params?.token ?? "";
  const appUrl = token ? `manatap://app/tournament?tournamentToken=${encodeURIComponent(token)}` : "manatap://";
  const webUrl = token
    ? `/tools/tournament-manager?tournamentToken=${encodeURIComponent(token)}`
    : "/tools/tournament-manager";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <section className="w-full max-w-md rounded-lg border border-amber-300/20 bg-neutral-900/80 p-6 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-300">ManaTap Tournament</p>
        <h1 className="mt-3 text-2xl font-black">Tournament invite ready</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-300">
          {canUseWebManager
            ? "Continue in the browser to join or manage the event. If you prefer the mobile app, you can still open this invite in ManaTap."
            : "This web tournament manager is in private preview. Open the invite in the ManaTap app to continue."}
        </p>
        {canUseWebManager ? (
          <Link
            href={webUrl}
            className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-amber-300 px-4 py-3 text-sm font-black text-neutral-950 transition hover:bg-amber-200"
          >
            Continue in browser
          </Link>
        ) : null}
        <a
          href={appUrl}
          className={`${canUseWebManager ? "mt-3" : "mt-5"} inline-flex w-full items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-100 transition hover:border-amber-300/50 hover:text-amber-100`}
        >
          Open ManaTap
        </a>
        <Link href="/tools" className="mt-4 block text-xs font-semibold text-neutral-400 hover:text-amber-200">
          Back to tools
        </Link>
      </section>
    </main>
  );
}
