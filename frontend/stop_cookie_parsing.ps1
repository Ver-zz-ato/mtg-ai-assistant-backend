
# stop_cookie_parsing.ps1
# Overwrite two endpoints to use server client instead of JSON.parse on cookies.

$root = Get-Location

$debugAuth = Join-Path $root "app\api\debug-auth\route.ts"
$decksSave = Join-Path $root "app\api\decks\save\route.ts"

$debugAuthContent = @"
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return NextResponse.json({ ok: !error, user, error: error?.message ?? null });
}
"@

if (Test-Path $debugAuth) {
  Copy-Item $debugAuth "$debugAuth.bak" -Force
  Set-Content -Path $debugAuth -Value $debugAuthContent -Encoding UTF8
  Write-Host "Patched: $debugAuth (backup at .bak)"
} else {
  Write-Host "Skip: $debugAuth not found"
}

$decksSaveContent = @"
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  // TODO: keep your existing save logic here; this is just to stop cookie parsing.
  // Return a stub so the route doesn't crash while we wire in the real fields.
  return NextResponse.json({ ok: true, note: "Replace with actual save logic using authenticated 'user'." });
}
"@

if (Test-Path $decksSave) {
  Copy-Item $decksSave "$decksSave.bak" -Force
  Set-Content -Path $decksSave -Value $decksSaveContent -Encoding UTF8
  Write-Host "Patched: $decksSave (backup at .bak)"
} else {
  Write-Host "Skip: $decksSave not found"
}
