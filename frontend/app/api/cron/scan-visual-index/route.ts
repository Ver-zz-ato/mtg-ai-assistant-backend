import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { logUnauthorizedCronAttempt, verifyCronRequest } from "@/lib/server/verifyCronRequest";
import {
  buildVisualIndexArtifacts,
  fetchScryfallCacheArtRows,
} from "@/lib/server/scanVisualIndex/build";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "scan-index";

export async function POST(req: NextRequest) {
  if (!verifyCronRequest(req, { routePath: "/api/cron/scan-visual-index" })) {
    logUnauthorizedCronAttempt(req, { routePath: "/api/cron/scan-visual-index" });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }
  const version = Number(process.env.SCAN_VISUAL_INDEX_VERSION ?? "1");
  const limitRows = Number(req.nextUrl.searchParams.get("limit") ?? "0");

  try {
    let rows = await fetchScryfallCacheArtRows(admin);
    if (limitRows > 0) rows = rows.slice(0, limitRows);

    const built = await buildVisualIndexArtifacts(rows);
    const aPath = `v${version}/scan-index-a.bin`;
    const bPath = `v${version}/scan-index-b.bin`;

    const { error: upA } = await admin.storage.from(BUCKET).upload(aPath, built.indexA, {
      contentType: "application/octet-stream",
      upsert: true,
    });
    if (upA) {
      return NextResponse.json({ ok: false, error: upA.message }, { status: 500 });
    }

    const { error: upB } = await admin.storage.from(BUCKET).upload(bPath, built.indexB, {
      contentType: "application/octet-stream",
      upsert: true,
    });
    if (upB) {
      return NextResponse.json({ ok: false, error: upB.message }, { status: 500 });
    }

    const { data: pubA } = admin.storage.from(BUCKET).getPublicUrl(aPath);
    const { data: pubB } = admin.storage.from(BUCKET).getPublicUrl(bPath);

    const manifest = {
      version,
      builtAt: new Date().toISOString(),
      cardCount: built.cardCount,
      skipped: built.skipped,
      bReady: true,
      a: { version, url: pubA.publicUrl, size: built.indexA.length },
      b: { version, url: pubB.publicUrl, size: built.indexB.length },
    };

    const { error: upManifest } = await admin.storage.from(BUCKET).upload("manifest.json", JSON.stringify(manifest), {
      contentType: "application/json",
      upsert: true,
    });
    if (upManifest) {
      return NextResponse.json({ ok: false, error: upManifest.message }, { status: 500 });
    }

    const { data: pubManifest } = admin.storage.from(BUCKET).getPublicUrl("manifest.json");

    return NextResponse.json({
      ok: true,
      cardCount: built.cardCount,
      skipped: built.skipped,
      manifestUrl: pubManifest.publicUrl,
      aUrl: pubA.publicUrl,
      bUrl: pubB.publicUrl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "build_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
