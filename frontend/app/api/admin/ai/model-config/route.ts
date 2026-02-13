/**
 * GET /api/admin/ai/model-config
 * Returns effective model configuration for all tiers and features.
 * Use this to verify which models are used (e.g. check if GPT-5 is configured).
 * Admin-only.
 */
import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { isAdmin } from '@/lib/admin-check';
import { getModelForTier } from '@/lib/ai/model-by-tier';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const envVars = {
      OPENAI_MODEL: process.env.OPENAI_MODEL ?? '(not set)',
      MODEL_PRO_CHAT: process.env.MODEL_PRO_CHAT ?? '(not set)',
      MODEL_PRO: process.env.MODEL_PRO ?? '(not set)',
      MODEL_PRO_DECK: process.env.MODEL_PRO_DECK ?? '(not set)',
      MODEL_FREE: process.env.MODEL_FREE ?? '(not set)',
      MODEL_GUEST: process.env.MODEL_GUEST ?? '(not set)',
      MODEL_DECK_SCAN: process.env.MODEL_DECK_SCAN ?? '(not set)',
      MODEL_AI_TEST: process.env.MODEL_AI_TEST ?? '(not set)',
      MODEL_DECK_ANALYZE_SLOTS: process.env.MODEL_DECK_ANALYZE_SLOTS ?? '(not set)',
      LLM_LAYER0: process.env.LLM_LAYER0 ?? '(not set)',
    };

    const effectiveModels = {
      guest: getModelForTier({ isGuest: true, userId: null, isPro: false }),
      free: getModelForTier({ isGuest: false, userId: 'user', isPro: false }),
      pro_chat: getModelForTier({ isGuest: false, userId: 'user', isPro: true }),
      pro_deck_analysis: getModelForTier({ isGuest: false, userId: 'user', isPro: true, useCase: 'deck_analysis' }),
    };

    return NextResponse.json({
      ok: true,
      env: envVars,
      effective: {
        guest: effectiveModels.guest.model,
        free: effectiveModels.free.model,
        pro_chat: effectiveModels.pro_chat.model,
        pro_deck_analysis: effectiveModels.pro_deck_analysis.model,
      },
      note: 'If pro_chat or pro_deck_analysis shows gpt-5 or similar, costs will be higher. Set MODEL_PRO_CHAT=gpt-4o to use gpt-4o for chat.',
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: (e instanceof Error ? e.message : String(e)) || 'server_error' },
      { status: 500 }
    );
  }
}
