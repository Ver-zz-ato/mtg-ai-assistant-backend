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
    const active = !!j?.active;
    if (!userId) return NextResponse.json({ ok:false, error:"missing_userId" }, { status:400 });

    const { data: got, error: ge } = await admin.auth.admin.getUserById(userId);
    if (ge) return NextResponse.json({ ok:false, error: ge.message }, { status:500 });
    const um = (got?.user?.user_metadata || {}) as any;
    const next = { ...um, billing_active: active };

    const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: next });
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });

    return NextResponse.json({ ok:true, userId, billing_active: active });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||"server_error" }, { status:500 });
  }
}
