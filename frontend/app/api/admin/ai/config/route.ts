import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { isAdmin } from '@/lib/admin-check';
import { getRuntimeAIConfig } from '@/lib/ai/runtime-config';

export const runtime = 'nodejs';

const ALLOWED_KEYS = ['flags', 'llm_budget', 'llm_models', 'llm_thresholds', 'llm_force_full_routes', 'llm_min_tokens_per_route'];

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

    const config = await getRuntimeAIConfig(supabase);
    let last_updated: Array<{ key: string; at: string; by: string }> = [];
    try {
      const admin = (await import('@/app/api/_lib/supa')).getAdmin();
      if (admin) {
        const { data: audit } = await admin
          .from('admin_audit_log')
          .select('payload_json, created_at, admin_user_id')
          .eq('action', 'config_set')
          .order('created_at', { ascending: false })
          .limit(50);
        const byKey = new Map<string, { at: string; by: string }>();
        for (const a of audit || []) {
          const row = a as { payload_json?: { key?: string }; created_at: string; admin_user_id?: string };
          const key = row.payload_json?.key;
          if (key && !byKey.has(key)) byKey.set(key, { at: row.created_at, by: row.admin_user_id || 'unknown' });
        }
        last_updated = Array.from(byKey.entries()).map(([key, v]) => ({ key, ...v }));
      }
    } catch {
      // admin_audit_log might not exist yet
    }

    return NextResponse.json({
      ok: true,
      config: { flags: config.flags, llm_budget: config.llm_budget, llm_models: config.llm_models, llm_thresholds: config.llm_thresholds, llm_force_full_routes: config.llm_force_full_routes, llm_min_tokens_per_route: config.llm_min_tokens_per_route },
      defaults: { flags: { llm_v2_context: true, llm_layer0: false, llm_two_stage: true } },
      last_updated,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const updates = body.updates != null ? body.updates : (body.key != null ? { [body.key]: body.value } : {});
    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: false, error: 'missing key or updates' }, { status: 400 });

    for (const key of Object.keys(updates)) {
      if (!ALLOWED_KEYS.includes(key)) return NextResponse.json({ ok: false, error: `invalid key: ${key}` }, { status: 400 });
    }

    const admin = (await import('@/app/api/_lib/supa')).getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: 'missing_service_role_key' }, { status: 500 });

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      const { data: before } = await admin.from('app_config').select('value').eq('key', key).maybeSingle();
      const beforeVal = (before as { value?: unknown } | null)?.value;
      await admin.from('app_config').upsert({ key, value }, { onConflict: 'key' });
      result[key] = value;
      try {
        await admin.from('admin_audit_log').insert({
          admin_user_id: user.id,
          action: 'config_set',
          payload_json: { key, before: beforeVal, after: value },
        });
      } catch {
        // table might not exist
      }
    }

    return NextResponse.json({ ok: true, updates: result });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'server_error' }, { status: 500 });
  }
}
