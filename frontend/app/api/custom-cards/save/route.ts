import { NextRequest, NextResponse } from 'next/server';
import { getUserAndSupabase } from '@/lib/api/get-user-from-request';
import { getServiceRoleClient } from '@/lib/supabase/server';

function slugify(n: string){ return (n||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,48) || 'card'; }

const SNAPSHOT_BUCKET = 'custom-card-snapshots';
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

function parseSnapshot(input: unknown, mimeInput: unknown): { bytes: Buffer; mime: string; ext: string } | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  let raw = input.trim();
  let mime = typeof mimeInput === 'string' && mimeInput.trim() ? mimeInput.trim().toLowerCase() : 'image/png';
  const dataUrl = raw.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if (dataUrl) {
    mime = dataUrl[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataUrl[1].toLowerCase();
    raw = dataUrl[2];
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return null;
  if (!/^[a-zA-Z0-9+/=\r\n]+$/.test(raw)) return null;
  const bytes = Buffer.from(raw.replace(/\s+/g, ''), 'base64');
  if (!bytes.length || bytes.length > MAX_SNAPSHOT_BYTES) return null;
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  return { bytes, mime, ext };
}

async function uploadSnapshot(userId: string, cardId: string, body: any): Promise<string | null> {
  const parsed = parseSnapshot(body?.snapshotBase64 ?? body?.snapshot_image_base64, body?.snapshotMimeType ?? body?.snapshot_mime_type);
  if (!parsed) return null;
  const admin = getServiceRoleClient();
  if (!admin) return null;
  await admin.storage.createBucket(SNAPSHOT_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_SNAPSHOT_BYTES}`,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  }).catch(() => null);
  const path = `${userId}/${cardId}.${parsed.ext}`;
  const { error } = await admin.storage.from(SNAPSHOT_BUCKET).upload(path, parsed.bytes, {
    contentType: parsed.mime,
    upsert: true,
  });
  if (error) return null;
  const { data } = admin.storage.from(SNAPSHOT_BUCKET).getPublicUrl(path);
  return data.publicUrl || null;
}

export async function POST(req: NextRequest){
  try{
    const { supabase: sb, user } = await getUserAndSupabase(req);
    if (!user) return NextResponse.json({ ok:false, error:'auth_required' }, { status: 401 });

    const body = await req.json();
    const value = body?.value || body; // expected to be the card object
    const title = String(body?.title || (Array.isArray(value?.nameParts)? value.nameParts.join(' ') : 'Custom Card'));
    const makePublic = String(req.nextUrl.searchParams.get('public')||'') === '1';

    // Determine Pro flag - use standardized check that checks both database and metadata
    const { checkProStatus } = await import('@/lib/server-pro-check');
    const isPro = await checkProStatus(user.id);
    const max = isPro ? 50 : 5;

    // Enforce quota
    const { count, error: cntErr } = await sb.from('custom_cards').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    if (!cntErr && typeof count === 'number' && count >= max) {
      return NextResponse.json({ ok:false, error:'quota_exceeded', max }, { status: 400 });
    }

    const row = { user_id: user.id, title, data: value } as any;
    if (makePublic) row.public_slug = `${slugify(title)}-${Math.random().toString(36).slice(2,8)}`;

    const { data: ins, error } = await sb.from('custom_cards').insert(row).select('id, public_slug').single();
    if (error) {
      const msg = String(error?.message||'error');
      if (/custom_cards/i.test(msg) && /does not exist|relation/.test(msg)) {
        return NextResponse.json({ ok:false, error:'missing_table', hint:`Create table custom_cards (id uuid default gen_random_uuid() primary key, user_id uuid not null, title text, data jsonb not null, public_slug text unique, created_at timestamptz default now()); Add RLS owner-only.` }, { status: 500 });
      }
      return NextResponse.json({ ok:false, error: msg }, { status: 500 });
    }

    const id = ins?.id;
    const slug = ins?.public_slug || id;
    let snapshotImageUrl: string | null = null;
    if (id) {
      snapshotImageUrl = await uploadSnapshot(user.id, id, body);
      if (snapshotImageUrl) {
        const nextData = { ...(value && typeof value === 'object' ? value : {}), snapshotImageUrl };
        await sb.from('custom_cards').update({ data: nextData }).eq('id', id).eq('user_id', user.id);
      }
    }
    
    // Log activity for live presence banner (server-side direct cache update)
    try {
      const { memoGet, memoSet } = await import('@/lib/utils/memoCache');
      const cacheKey = 'activity_log';
      const existing = memoGet<any[]>(cacheKey) || [];
      const newActivity = {
        type: 'custom_card',
        message: 'Custom card created',
        timestamp: new Date().toISOString(),
      };
      const updated = [newActivity, ...existing].slice(0, 50);
      memoSet(cacheKey, updated, 24 * 60 * 60 * 1000); // 24 hours
    } catch {}
    
    // Prefer absolute base from env if valid; otherwise fall back to current origin
    const envBase = (process.env.NEXT_PUBLIC_BASE_URL || '').trim();
    const base = /^https?:\/\//i.test(envBase) ? envBase.replace(/\/$/, '') : (req.nextUrl?.origin || '');
    const url = slug ? `${base}/cards/${encodeURIComponent(slug)}` : null;
    return NextResponse.json({ ok:true, id, slug, url, max, snapshotImageUrl });
  } catch(e: any){
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status: 500 });
  }
}
