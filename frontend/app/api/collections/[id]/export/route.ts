import { createClient } from "@/lib/server-supabase";

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
    // Enrich with set and collector number
    const names = Array.from(new Set(rows.map(r=>r.name)));
    const { data: meta } = await supabase
      .from('scryfall_cache')
      .select('name,set,collector_number')
      .in('name', names)
      .limit(2000);
    const map = new Map<string, { set?: string; collector_number?: string }>();
    for (const m of meta||[]) map.set((m as any).name, { set: (m as any).set?.toUpperCase(), collector_number: (m as any).collector_number });
    const enriched = rows.map(r => ({ ...r, ...(map.get(r.name)||{}) }));
    return asAttachment(formatMTGO(enriched), `collection-${id}.dek`);
  }

  return new Response(JSON.stringify({ ok:false, error: 'Unsupported format' }), { status: 400, headers:{'content-type':'application/json'} });
}