import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSharedHealthReport } from "@/app/api/_lib/shared-reports";

export const dynamic = "force-dynamic";

const BASE = "https://www.manatap.ai";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await getSharedHealthReport(id);
  const snap = row?.snapshot_json;
  const title = snap?.title ? `${snap.title} health report | ManaTap` : "Shared deck health report | ManaTap";
  return {
    title,
    description: "View a shared ManaTap deck health snapshot.",
    alternates: { canonical: `${BASE}/share/health/${id}` },
    openGraph: { title, description: "View a shared ManaTap deck health snapshot.", url: `${BASE}/share/health/${id}` },
  };
}

export default async function SharedHealthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getSharedHealthReport(id);
  if (!row?.snapshot_json) notFound();
  const snap = row.snapshot_json;
  const meta = [snap.format, snap.commander].filter(Boolean).join(" · ");

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto max-w-3xl px-4 py-10">
        <a className="text-sm font-medium text-sky-300 hover:text-sky-200" href="/">
          ← ManaTap
        </a>
        <div className="mt-6 rounded-2xl border border-sky-500/30 bg-neutral-900/70 p-6 shadow-2xl shadow-sky-950/30">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Shared health snapshot</p>
          <h1 className="mt-3 text-2xl font-black">{snap.title || "Deck health"}</h1>
          <p className="mt-2 text-sm text-neutral-400">
            {[meta, new Date(row.created_at).toLocaleString()].filter(Boolean).join(" · ")}
          </p>

          {snap.free?.signals?.length ? (
            <div className="mt-8 space-y-3">
              <h2 className="text-lg font-bold">Signals</h2>
              {snap.free.signals.map((signal) => (
                <div key={signal.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-sm font-bold">{signal.title}</p>
                  <p className="mt-1 text-sm text-neutral-300">{signal.description}</p>
                </div>
              ))}
            </div>
          ) : null}

          {snap.free?.tips?.length ? (
            <div className="mt-8">
              <h2 className="text-lg font-bold">Next steps</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-300">
                {snap.free.tips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {snap.pro?.overview ? (
            <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <h2 className="text-lg font-bold text-amber-200">Pro overview</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-200">{snap.pro.overview}</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
