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
function norm(s:string){ return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim(); }

export async function GET(req: NextRequest){
  try{
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok:false, error:"forbidden" }, { status:403 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok:false, error:"missing_service_role_key" }, { status:500 });

    const q = String(req.nextUrl.searchParams.get("q") || "");
    const page = 1, perPage = 1000;
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });

    const needle = norm(q);
    const users = (data?.users || []).map((u:any) => {
      const um = (u?.user_metadata || {}) as any;
      const avatar = um.avatar || um.avatar_url || null;
      const username = um.username || um.display_name || null;
      const pro = !!um.pro;
      return { id: u.id, email: u.email, username, avatar, pro };
    }).filter((u:any) => {
      if (!needle) return true;
      return [u.id, u.email, u.username].some(v => norm(v||"").includes(needle));
    }).slice(0, 100);

    return NextResponse.json({ ok:true, users });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||"server_error" }, { status:500 });
  }
}