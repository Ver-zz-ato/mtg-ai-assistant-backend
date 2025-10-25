import AuthenticMTGCard from '@/components/AuthenticMTGCard';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CardPage({ params }: { params: Promise<{ id: string }> }){
  const { id } = await params;
  try{
    const sb = await createClient();
    // Try by slug first (public), then by ID (owner access only per RLS)
    let { data, error } = await sb.from('custom_cards').select('id, title, data, public_slug').eq('public_slug', id).maybeSingle();
    if (!data) {
      const byId = await sb.from('custom_cards').select('id, title, data, public_slug').eq('id', id).maybeSingle();
      data = (byId as any).data; error = (byId as any).error;
    }
    if (error || !data) throw new Error(error?.message||'not_found');
    const card = data;
    return (
      <main className="max-w-4xl mx-auto p-4">
        <h1 className="text-lg font-semibold mb-2">{card?.title || 'Custom Card'}</h1>
        <div className="inline-block">
          <AuthenticMTGCard value={card?.data||{}} mode='view' />
        </div>
      </main>
    );
  } catch {
    return (<main className="max-w-4xl mx-auto p-4"><div className="text-sm text-red-400">Card not found.</div></main>);
  }
}
