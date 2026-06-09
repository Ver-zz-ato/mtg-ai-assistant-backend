import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isInternalEmail(email: string): boolean {
  const raw = process.env.INTERNAL_EMAILS || process.env.ADMIN_EMAILS || '';
  const list = raw.split(/[\s,]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const email = user.email || '';
  return NextResponse.json({
    ok: true,
    is_internal: email ? isInternalEmail(email) : false,
  });
}
