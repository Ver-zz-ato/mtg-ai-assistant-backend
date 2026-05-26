import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest){
  try{
    // CSRF protection: Validate Origin header
    const { validateOrigin } = await import('@/lib/api/csrf');
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid origin. This request must come from the same site.' },
        { status: 403 }
      );
    }

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok:false, error:"forbidden" }, { status:403 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok:false, error:"missing_service_role_key" }, { status:500 });

    const j = await req.json().catch(()=>({}));
    const userId = String(j?.userId || "");
    const pro = !!j?.pro;
    if (!userId) return NextResponse.json({ ok:false, error:"missing_userId" }, { status:400 });

    // Update user_metadata (for backward compatibility)
    const { data: got, error: ge } = await admin.auth.admin.getUserById(userId);
    if (ge) return NextResponse.json({ ok:false, error: ge.message }, { status:500 });
    const um = (got?.user?.user_metadata || {}) as any;
    const next = { ...um, pro, is_pro: pro }; // Also set is_pro for consistency

    const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: next });
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });

    // Use the service-role client for the actual entitlement write so RLS cannot silently no-op.
    const { data: existingProfile, error: existingProfileError } = await admin
      .from('profiles')
      .select('id, is_pro, pro_since')
      .eq('id', userId)
      .maybeSingle();
    if (existingProfileError) {
      console.error('Failed to load existing profile before Pro update:', existingProfileError);
      return NextResponse.json({ ok:false, error: `profile_lookup_failed: ${existingProfileError.message}` }, { status:500 });
    }
    if (!existingProfile?.id) {
      return NextResponse.json({ ok:false, error:"profile_not_found" }, { status:404 });
    }

    const nextProSince =
      pro
        ? (existingProfile.is_pro && existingProfile.pro_since ? existingProfile.pro_since : new Date().toISOString())
        : null;

    const { data: updatedProfile, error: profileError } = await admin
      .from('profiles')
      .update({
        is_pro: pro,
        pro_plan: pro ? 'manual' : null,
        pro_since: nextProSince,
        pro_until: null,
      })
      .eq('id', userId)
      .select('id, is_pro, pro_plan, pro_since, pro_until')
      .single();

    if (profileError) {
      console.error('Failed to update profiles.is_pro:', profileError);
      return NextResponse.json({ ok:false, error: `Metadata updated but profile update failed: ${profileError.message}` }, { status:500 });
    }
    if (!updatedProfile || updatedProfile.is_pro !== pro) {
      console.error('Profile Pro update verification failed:', { userId, expected: pro, updatedProfile });
      return NextResponse.json({ ok:false, error:"profile_update_verification_failed" }, { status:500 });
    }

    // Audit log for Pro status changes
    try {
      await supabase.from('admin_audit').insert({
        actor_id: user.id,
        action: 'user_pro_status_changed',
        target: userId,
        payload: { pro, changed_by: user.email || user.id }
      });
    } catch (auditError) {
      // Don't fail request if audit logging fails
      console.error('Failed to log admin audit:', auditError);
    }

    console.info('Admin manually set Pro status', { userId, pro, admin: user.email });
    return NextResponse.json({ ok:true, userId, pro, profile: updatedProfile });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||"server_error" }, { status:500 });
  }
}
