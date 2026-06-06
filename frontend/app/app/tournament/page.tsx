import Link from "next/link";

export default function TournamentInvitePage({
  searchParams,
}: {
  searchParams?: { tournamentToken?: string; token?: string };
}) {
  const token = searchParams?.tournamentToken ?? searchParams?.token ?? "";
  const appUrl = token ? `manatap://app/tournament?tournamentToken=${encodeURIComponent(token)}` : "manatap://";

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-6">
      <section className="max-w-md w-full rounded-2xl border border-amber-300/20 bg-neutral-900/80 p-6 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-300">ManaTap Tournament</p>
        <h1 className="mt-3 text-2xl font-black">Open this invite in ManaTap</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-300">
          If the app is installed, this tournament link should open ManaTap automatically. If it stayed in the browser, tap the button below.
        </p>
        <a
          href={appUrl}
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-neutral-950"
        >
          Open ManaTap
        </a>
        <Link href="/" className="mt-4 block text-xs font-semibold text-neutral-400 hover:text-amber-200">
          Back to manatap.ai
        </Link>
      </section>
    </main>
  );
}
