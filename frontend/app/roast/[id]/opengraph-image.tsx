import { ImageResponse } from "next/og";
import { createClientForStatic } from "@/lib/server-supabase";

export const alt = "Roast my Deck — ManaTap AI";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function truncate(text: string, max: number): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").replace(/\[\[[^\]]+\]\]/g, "").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Extract a single punchy "best burn" line for the OG image — the shareable joke.
 * Prefer a short sentence (40–maxChars) that reads like a one-liner; else first sentence or truncate.
 */
function extractBestBurn(roastText: string, maxChars: number): string {
  if (!roastText) return "AI-powered Commander deck roast.";
  const clean = roastText.replace(/\[\[[^\]]+\]\]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "AI-powered Commander deck roast.";
  const sentences = clean.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const punchy = sentences.filter((s) => s.length >= 40 && s.length <= maxChars);
  const best = punchy[0] ?? sentences.find((s) => s.length <= maxChars) ?? clean;
  return best.length <= maxChars ? best : `${best.slice(0, maxChars - 1)}…`;
}

/** Normalize card name for cache lookup (match scryfallCache convention). */
function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve commander art URL: prefer roast row's commander_art_url, else read-only scryfall_cache lookup.
 * No remote Scryfall fetch — cache only, so OG stays fast for crawlers.
 */
async function getCommanderArtUrl(
  commanderName: string | null,
  rowArtUrl: string | null
): Promise<string | null> {
  if (!commanderName) return null;
  if (rowArtUrl && rowArtUrl.startsWith("http")) return rowArtUrl;
  try {
    const supabase = createClientForStatic();
    const withoutSet = commanderName.replace(/\s*\([^)]*\)\s*$/, "").trim() || commanderName;
    const key = norm(withoutSet);
    if (!key) return null;
    const { data: row } = await supabase
      .from("scryfall_cache")
      .select("art_crop, normal")
      .eq("name", key)
      .maybeSingle();
    if (!row) return null;
    return row.art_crop || row.normal || null;
  } catch {
    return null;
  }
}

const HEAT_LABELS: Record<string, string> = {
  gentle: "Gentle 🙂",
  balanced: "Balanced 😏",
  spicy: "Spicy 🌶️",
  savage: "Savage 🔥",
};

/** Accent color by heat for subtle theme tint */
function heatAccent(level: string): { bg: string; border: string; text: string } {
  const l = level.toLowerCase();
  if (l === "gentle") return { bg: "rgba(34, 197, 94, 0.2)", border: "rgba(74, 222, 128, 0.5)", text: "#86efac" };
  if (l === "balanced") return { bg: "rgba(234, 179, 8, 0.2)", border: "rgba(250, 204, 21, 0.5)", text: "#fde047" };
  if (l === "spicy") return { bg: "rgba(234, 88, 12, 0.2)", border: "rgba(251, 146, 60, 0.5)", text: "#fdba74" };
  if (l === "savage") return { bg: "rgba(185, 28, 28, 0.25)", border: "rgba(248, 113, 113, 0.5)", text: "#fca5a5" };
  return { bg: "rgba(180, 83, 9, 0.25)", border: "rgba(217, 119, 6, 0.5)", text: "#fcd34d" };
}

function FallbackImage() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 48,
        background: "linear-gradient(135deg, #0b0b0f 0%, #17131f 100%)",
        color: "white",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#fef3c7" }}>ManaTap AI</div>
        <div style={{ fontSize: 22, color: "#a8a29e" }}>ROAST MY DECK</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 52, fontWeight: 800, color: "#fef3c7" }}>Roast My Deck</div>
        <div style={{ fontSize: 28, color: "#a8a29e" }}>AI-powered Commander deck roasts</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#78716c" }}>
        <div>Try it at manatap.ai</div>
        <div>manatap.ai</div>
      </div>
    </div>
  );
}

export default async function RoastOgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let commanderName = "This deck";
  let heatLabel = "AI Roast";
  let burnLine = "AI-powered Commander deck roast.";
  let level = "balanced";

  let commanderArtUrl: string | null = null;

  try {
    const supabase = createClientForStatic();
    const { data: row } = await supabase
      .from("roast_permalinks")
      .select("commander, roast_level, roast_text, commander_art_url")
      .eq("id", id)
      .maybeSingle();

    if (!row) {
      return new ImageResponse(<FallbackImage />, { ...size });
    }

    commanderName = row.commander || "This deck";
    level = (row.roast_level || "balanced").toLowerCase();
    heatLabel = HEAT_LABELS[level] || "AI Roast";
    burnLine = extractBestBurn(row.roast_text ?? "", 140);
    commanderArtUrl = await getCommanderArtUrl(
      row.commander || null,
      row.commander_art_url || null
    );
  } catch {
    return new ImageResponse(<FallbackImage />, { ...size });
  }

  const accent = heatAccent(level);
  const hasArt = Boolean(commanderArtUrl);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          background: "linear-gradient(135deg, #0b0b0f 0%, #17131f 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {hasArt && (
          <div
            style={{
              width: 380,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              background: "rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                width: 316,
                height: 434,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src={commanderArtUrl!}
                alt=""
                width={316}
                height={434}
                style={{ objectFit: "cover", width: "100%", height: "100%" }}
              />
            </div>
          </div>
        )}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 48,
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fef3c7" }}>ManaTap AI</div>
            <div style={{ fontSize: 22, color: "#a8a29e" }}>ROAST MY DECK</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: hasArt ? 38 : 44, fontWeight: 800, color: "#fef3c7", lineHeight: 1.1 }}>
              {commanderName}
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: accent.text,
                padding: "10px 20px",
                borderRadius: 9999,
                background: accent.bg,
                border: `2px solid ${accent.border}`,
                width: "fit-content",
              }}
            >
              {heatLabel}
            </div>
            <div
              style={{
                fontSize: hasArt ? 32 : 38,
                lineHeight: 1.25,
                color: "#fef3c7",
                maxWidth: hasArt ? 680 : 1000,
                fontStyle: "italic",
              }}
            >
              "{burnLine}"
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 24, color: "#78716c" }}>
            <div>manatap.ai</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
