import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
const BASE = "https://www.manatap.ai";

type AnalysisSnapshot = {
  title?: string;
  result?: {
    ok?: boolean;
    summary?: string;
    score?: number;
    issues?: string[];
    fixes?: string[];
    priority?: string[];
    whatsGood?: string[];
    suggestions?: { card?: string; reason?: string; category?: string }[];
    analysis?: {
      summary?: string | null;
      archetype?: string | null;
      game_plan?: string | null;
      main_problems?: string[];
      priority_actions?: string[];
    } | null;
  };
};

async function getShare(id: string) {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data } = await admin
    .from("shared_analysis_reports")
    .select("id, snapshot_json, created_at, expires_at")
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data as { id: string; snapshot_json: AnalysisSnapshot; created_at: string; expires_at: string } | null;
}

function list(items: string[] | undefined, empty: string) {
  if (!items?.length) return <p className="text-sm text-neutral-400">{empty}</p>;
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-300">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await getShare(id);
  const title = row?.snapshot_json?.title
    ? `${row.snapshot_json.title} analysis | ManaTap`
    : "Shared deck analysis | ManaTap";
  return {
    title,
    description: "View a shared ManaTap AI deck analysis snapshot.",
    alternates: { canonical: `${BASE}/share/analysis/${id}` },
    openGraph: { title, description: "View a shared ManaTap AI deck analysis snapshot.", url: `${BASE}/share/analysis/${id}` },
  };
}

export default async function SharedAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getShare(id);
  const result = row?.snapshot_json?.result;
  if (!row || !result?.ok) notFound();
  const structured = result.analysis ?? null;
  const summary = structured?.summary || result.summary || "This shared analysis snapshot is ready.";
  const priority = structured?.priority_actions?.length ? structured.priority_actions : result.priority;
  const issues = structured?.main_problems?.length ? structured.main_problems : result.issues;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto max-w-3xl px-4 py-10">
        <a className="text-sm font-medium text-sky-300 hover:text-sky-200" href="/">
          ← ManaTap
        </a>
        <div className="mt-6 rounded-2xl border border-violet-500/30 bg-neutral-900/70 p-6 shadow-2xl shadow-violet-950/30">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">Shared AI analysis</p>
          <h1 className="mt-3 text-2xl font-black">{row.snapshot_json.title || "Deck analysis"}</h1>
          <p className="mt-2 text-sm text-neutral-400">
            {[new Date(row.created_at).toLocaleString(), typeof result.score === "number" ? `Score ${result.score}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-6 whitespace-pre-wrap text-sm leading-6 text-neutral-200">{summary}</p>

          {structured?.archetype || structured?.game_plan ? (
            <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              {structured.archetype ? <p className="text-sm font-bold">Archetype: {structured.archetype}</p> : null}
              {structured.game_plan ? <p className="mt-2 text-sm text-neutral-300">{structured.game_plan}</p> : null}
            </div>
          ) : null}

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <h2 className="font-bold">Main problems</h2>
              {list(issues, "No major problems were captured.")}
            </section>
            <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <h2 className="font-bold">Priority actions</h2>
              {list(priority, "No priority actions were captured.")}
            </section>
          </div>

          {result.suggestions?.length ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold">Suggested cards</h2>
              <div className="mt-3 space-y-3">
                {result.suggestions.slice(0, 12).map((suggestion, index) => (
                  <div key={`${suggestion.card}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="font-bold">{suggestion.card || "Card suggestion"}</p>
                    {suggestion.reason ? <p className="mt-1 text-sm text-neutral-300">{suggestion.reason}</p> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
