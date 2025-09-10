// scripts/patch-collections-cards-robust.js
// Makes PATCH /api/collections/cards accept flexible id/delta shapes (body or query).
// Leaves other handlers intact. Creates a .bak once.

const fs = require("fs");
const path = require("path");

const FILE = path.join("app", "api", "collections", "cards", "route.ts");
const BAK  = FILE + ".bak";

if (!fs.existsSync(FILE)) {
  console.error(`❌ Could not find ${FILE}. Adjust path if needed.`);
  process.exit(1);
}

if (!fs.existsSync(BAK)) {
  fs.copyFileSync(FILE, BAK);
  console.log(`🧰 Backed up: ${BAK}`);
} else {
  console.log(`ℹ️ Backup already exists: ${BAK}`);
}

let src = fs.readFileSync(FILE, "utf8");

// helper: swap function implementation by exact handler name
function replaceHandler(name, impl) {
  const re = new RegExp(
    `export\\s+async\\s+function\\s+${name}\\s*\\(\\s*req\\s*:\\s*Request\\s*\\)\\s*\\{[\\s\\S]*?\\n\\}`,
    "m"
  );
  if (!re.test(src)) {
    console.log(`⚠️ Could not find existing ${name} handler. Skipping.`);
    return false;
  }
  src = src.replace(re, impl.trim());
  return true;
}

const PATCH_IMPL = `
export async function PATCH(req: Request) {
  try {
    const url = new URL(req.url);

    // 1) pull body (may be empty)
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    // 2) Accept id from multiple keys (body or query)
    const id =
      body.id ??
      body.cardId ??
      body.card_id ??
      url.searchParams.get("id") ??
      url.searchParams.get("cardId") ??
      url.searchParams.get("card_id");

    if (!id) {
      return Response.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    // 3) Two PATCH modes:
    //    A) Absolute qty mode: { id, qty } in body
    //    B) Delta mode: any of the below in body or query
    const qtyRaw = body.qty;
    const hasQty = qtyRaw !== undefined && qtyRaw !== null && qtyRaw !== "";
    let qtyAbsolute = Number(qtyRaw);

    // Normalize delta
    let deltaRaw =
      body.delta ?? body.d ?? body.qtyDelta ??
      url.searchParams.get("delta") ??
      url.searchParams.get("d") ??
      url.searchParams.get("qtyDelta");

    // Handle action-style params: ?op=inc|dec or ?inc=1 / ?dec=1
    const op = url.searchParams.get("op");
    if (op === "inc") deltaRaw = (deltaRaw ?? 0) || 1;
    if (op === "dec") deltaRaw = (deltaRaw ?? 0) || -1;
    if (url.searchParams.has("inc")) deltaRaw = (deltaRaw ?? 0) || 1;
    if (url.searchParams.has("dec")) deltaRaw = (deltaRaw ?? 0) || -1;

    // Fix weird cases like delta='+' or delta='-'
    if (deltaRaw === "+") deltaRaw = 1;
    if (deltaRaw === "-") deltaRaw = -1;

    const hasDelta = deltaRaw !== undefined && deltaRaw !== null && deltaRaw !== "";
    const delta = hasDelta ? Number(deltaRaw) : NaN;

    const supabase = await createClient();

    // Fetch current row to know current qty
    const { data: current, error: selErr } = await supabase
      .from("collection_cards")
      .select("qty")
      .eq("id", id)
      .single();

    if (selErr) {
      return Response.json({ ok: false, error: selErr.message }, { status: 400 });
    }

    // Mode A: absolute qty
    if (hasQty && Number.isFinite(qtyAbsolute)) {
      if (qtyAbsolute <= 0) {
        const { error: delErr } = await supabase.from("collection_cards").delete().eq("id", id);
        if (delErr) return Response.json({ ok: false, error: delErr.message }, { status: 400 });
        return Response.json({ ok: true, deleted: true });
      }
      const { data: updated, error: updErr } = await supabase
        .from("collection_cards")
        .update({ qty: qtyAbsolute })
        .eq("id", id)
        .select()
        .single();
      if (updErr) return Response.json({ ok: false, error: updErr.message }, { status: 400 });
      return Response.json({ ok: true, item: updated });
    }

    // Mode B: delta
    if (!hasDelta || !Number.isFinite(delta) || delta === 0) {
      return Response.json(
        { ok: false, error: "id and non-zero numeric delta are required" },
        { status: 400 }
      );
    }

    const newQty = (current?.qty ?? 0) + delta;

    if (newQty <= 0) {
      const { error: delErr } = await supabase.from("collection_cards").delete().eq("id", id);
      if (delErr) return Response.json({ ok: false, error: delErr.message }, { status: 400 });
      return Response.json({ ok: true, deleted: true });
    }

    const { data: updated, error: updErr } = await supabase
      .from("collection_cards")
      .update({ qty: newQty })
      .eq("id", id)
      .select()
      .single();

    if (updErr) return Response.json({ ok: false, error: updErr.message }, { status: 400 });
    return Response.json({ ok: true, item: updated });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
`;

const changed = replaceHandler("PATCH", PATCH_IMPL);

if (changed) {
  fs.writeFileSync(FILE, src, "utf8");
  console.log(`✅ Patched ${FILE}`);
  try {
    fs.appendFileSync(
      "CHANGELOG.txt",
      [
        "2025-09-10 – Improve /api/collections/cards PATCH:",
        "- Accept id via id|cardId|card_id (body or query).",
        "- Accept delta via delta|d|qtyDelta (body or query).",
        "- Support ?op=inc|dec, ?inc=1, ?dec=1, and delta='+'/'-'.",
        "- Support absolute qty mode: { id, qty }.",
        "- Auto-delete on qty<=0.",
        "",
      ].join("\\n")
    );
    console.log("📝 Updated CHANGELOG.txt");
  } catch {}
} else {
  console.log("ℹ️ No changes applied (handler not matched).");
}
