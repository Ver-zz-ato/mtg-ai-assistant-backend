import { createClient } from "@/lib/server-supabase";
import { normalizeScryfallCacheName, scryfallCacheLookupNameKeys } from "@/lib/server/scryfallCacheRow";
import { cleanCardName } from "@/lib/deck/cleanCardName";

function asAttachment(body: string, filename: string, mime = 'text/plain') {
  return new Response(body, {
    headers: {
      'content-type': mime + '; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

function formatMTGA(rows: Array<{ name: string; qty: number }>) {
  return rows.map(r => `${r.qty} ${r.name}`).join('\n') + '\n';
}

function formatCSV(rows: Array<{ name: string; qty: number }>) {
  const lines = ['name,qty'];
  for (const r of rows) lines.push(`${JSON.stringify(r.name)},${r.qty}`);
  return lines.join('\n') + '\n';
}

function formatMoxfield(rows: Array<{ name: string; qty: number }>) {
  // Simple list; Moxfield accepts count+name lines
  return rows.map(r => `${r.qty} ${r.name}`).join('\n') + '\n';
}

function formatMTGO(rows: Array<{ name: string; qty: number; set?: string; collector_number?: string }>) {
  // .dek header + entries
  const header = '// Created by Export, https://moxfield.com\n';
  const lines = rows.map(r => `${r.qty} ${r.name}${r.set? ` (${r.set})`: ''}${r.collector_number? ` ${r.collector_number}`: ''}`);
  return header + lines.join('\n') + '\n';
}

type Params = { id: string };

export async function GET(req: Request, ctx: { params: Promise<Params> }) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const format = (searchParams.get('format') || 'csv').toLowerCase();
  const { id } = await ctx.params;

  const { data: cards, error } = await supabase
    .from('collection_cards')
    .select('name,qty')
    .eq('collection_id', id)
    .order('name', { ascending: true });
  if (error) return new Response(JSON.stringify({ ok:false, error: error.message }), { status: 500, headers:{'content-type':'application/json'} });

  const rows = (cards||[]).map(c => ({ name: c.name as string, qty: Number((c as any).qty)||0 }));

  if (format === 'csv') return asAttachment(formatCSV(rows), `collection-${id}.csv`, 'text/csv');
  if (format === 'mtga') return asAttachment(formatMTGA(rows), `collection-${id}.mtga`);
  if (format === 'moxfield') return asAttachment(formatMoxfield(rows), `collection-${id}.txt`);
  if (format === 'mtgo') {
    // Enrich with set and collector number (scryfall_cache.name is oracle PK)
    const pkCandidates = [...new Set(rows.flatMap((r) => scryfallCacheLookupNameKeys(String(r.name || ""))))];
    const { data: meta } =
      pkCandidates.length > 0
        ? await supabase
            .from('scryfall_cache')
            .select('name,set,collector_number')
            .in('name', pkCandidates)
            .limit(2000)
        : { data: null as null };
    const byPk = new Map<string, { set?: string; collector_number?: string }>();
    for (const m of meta || [])
      byPk.set(String((m as any).name), {
        set: (m as any).set?.toUpperCase(),
        collector_number: (m as any).collector_number,
      });
    const enriched = rows.map((r) => {
      const raw = String(r.name || "").trim();
      const extra =
        byPk.get(normalizeScryfallCacheName(raw)) ?? byPk.get(normalizeScryfallCacheName(cleanCardName(raw))) ?? {};
      return { ...r, ...extra };
    });
    return asAttachment(formatMTGO(enriched), `collection-${id}.dek`);
  }

  return new Response(JSON.stringify({ ok:false, error: 'Unsupported format' }), { status: 400, headers:{'content-type':'application/json'} });
}