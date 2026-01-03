// frontend/app/api/profile/popular-commanders/route.ts
// Returns image URLs for 20 popular commander avatars from cache
import { NextResponse } from "next/server";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

// Popular commanders (top 20 by general popularity/EDHREC usage)
const POPULAR_COMMANDERS = [
  "The Ur-Dragon",
  "Atraxa, Praetors' Voice",
  "Edgar Markov",
  "Krenko, Mob Boss",
  "Kaalia of the Vast",
  "Yuriko, the Tiger's Shadow",
  "Meren of Clan Nel Toth",
  "Chulane, Teller of Tales",
  "Korvold, Fae-Cursed King",
  "Prosper, Tome-Bound",
  "Kenrith, the Returned King",
  "Kess, Dissident Mage",
  "Thrasios, Triton Hero",
  "Tymna the Weaver",
  "Breya, Etherium Shaper",
  "Muldrotha, the Gravetide",
  "Ghave, Guru of Spores",
  "Yawgmoth, Thran Physician",
  "The Gitrog Monster",
  "Najeela, the Blade-Blossom"
];

export async function GET() {
  try {
    // Fetch images from cache
    const imgMap = await getImagesForNamesCached(POPULAR_COMMANDERS);
    
    // Build array of image URLs (art_crop preferred, fallback to normal/small)
    const avatars: string[] = [];
    for (const commander of POPULAR_COMMANDERS) {
      const normalized = commander.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
      const img = imgMap.get(normalized);
      if (img?.art_crop || img?.normal || img?.small) {
        avatars.push(img.art_crop || img.normal || img.small || '');
      }
    }
    
    return NextResponse.json({ ok: true, avatars });
  } catch (err: any) {
    console.error("[popular-commanders] Error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
