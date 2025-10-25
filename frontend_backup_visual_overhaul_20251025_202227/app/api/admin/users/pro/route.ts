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

    // CRITICAL: Also update profiles.is_pro (single source of truth)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        is_pro: pro,
        pro_plan: pro ? 'manual' : null, // Mark as manually set
        pro_since: pro ? new Date().toISOString() : null,
        pro_until: null, // No expiry for manual Pro
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Failed to update profiles.is_pro:', profileError);
      return NextResponse.json({ ok:false, error: `Metadata updated but profile update failed: ${profileError.message}` }, { status:500 });
    }

    console.info('Admin manually set Pro status', { userId, pro, admin: user.email });
    return NextResponse.json({ ok:true, userId, pro });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||"server_error" }, { status:500 });
  }
}