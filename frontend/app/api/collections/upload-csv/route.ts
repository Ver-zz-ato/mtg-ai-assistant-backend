// app/api/collections/upload-csv/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withLogging } from "@/lib/api/withLogging";
import { parseCollectionCsvText } from "@/lib/csv/collection";

export const dynamic = "force-dynamic";

export const POST = withLogging(async (req: Request) => {
  const supabase = await createClient();
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Use multipart/form-data" }, { status: 400 });

  const file = form.get("file");
  const collectionId = String(form.get("collectionId") || "");
  if (!(file instanceof Blob)) return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
  if (!collectionId) return NextResponse.json({ ok: false, error: "collectionId required" }, { status: 400 });

  // Ownership check
  const { data: col, error: cErr } = await supabase.from("collections").select("id, user_id").eq("id", collectionId).single();
  if (cErr || !col) return NextResponse.json({ ok: false, error: "Collection not found" }, { status: 404 });
  if (col.user_id !== user.id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const text = await (file as Blob).text();
  const { rows: items, report } = parseCollectionCsvText(text);

  let added = 0, updated = 0, skipped: string[] = [];
  for (const it of items) {
    // Look up existing row by (collection_id, name)
    const { data: existing } = await supabase
      .from("collection_cards")
      .select("id, qty")
      .eq("collection_id", collectionId)
      .eq("name", it.name)
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await supabase.from("collection_cards").insert({
        collection_id: collectionId,
        name: it.name,
        qty: it.qty,
      });
      if (insErr) skipped.push(`${it.name} (${it.qty})`);
      else added++;
    } else {
      const { error: upErr } = await supabase
        .from("collection_cards")
        .update({ qty: (existing.qty as number) + it.qty })
        .eq("id", existing.id);
      if (upErr) skipped.push(`${it.name} (${it.qty})`);
      else updated++;
    }
  }

  return NextResponse.json({ ok: true, report: { added, updated, skipped, total: items.length, parser: report } });
});
