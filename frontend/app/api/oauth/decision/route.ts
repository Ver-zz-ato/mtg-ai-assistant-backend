import { NextResponse } from "next/server";
import { createClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const decision = formData.get("decision");
    const authorizationId = String(formData.get("authorization_id") ?? "").trim();

    if (!authorizationId) {
      return NextResponse.json({ error: "Missing authorization_id" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const oauth = (supabase.auth as any).oauth;
    if (!oauth?.approveAuthorization || !oauth?.denyAuthorization) {
      return NextResponse.json(
        { error: "OAuth Server not available. Upgrade @supabase/supabase-js." },
        { status: 503 }
      );
    }

    if (decision === "approve") {
      const { data, error } = await oauth.approveAuthorization(authorizationId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (data?.redirect_to) {
        return NextResponse.redirect(data.redirect_to);
      }
      return NextResponse.json({ error: "No redirect URL" }, { status: 500 });
    }

    const { data, error } = await oauth.denyAuthorization(authorizationId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (data?.redirect_to) {
      return NextResponse.redirect(data.redirect_to);
    }
    return NextResponse.json({ error: "No redirect URL" }, { status: 500 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    console.error("OAuth decision error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
