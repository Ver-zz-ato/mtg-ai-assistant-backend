// @server-only
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

let aliasMap = new Map<string, string>();
let cardMap = new Map<string, { name: string; oracle_id?: string }>();
let loadedAt = 0;
let hits = 0;
let misses = 0;
let dataVersion = "unset";
let lastFiles: string[] = [];

const TTL_MS = Number(process.env.CANON_TTL_MS || 5 * 60 * 1000); // 5 minutes default

function readLines(p: string): string[] {
  try {
    const text = fs.readFileSync(p, "utf8");
    return text.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function computeVersion(files: string[]): string {
  try {
    const hash = crypto.createHash("sha1");
    for (const f of files) {
      try {
        const st = fs.statSync(f);
        hash.update(f + String(st.size) + String(st.mtimeMs));
      } catch {}
    }
    return hash.digest("hex").slice(0, 12);
  } catch {
    return String(Date.now());
  }
}

function loadFilesIfNeeded(force = false) {
  const now = Date.now();
  if (!force && loadedAt && now - loadedAt < TTL_MS) return; // still fresh

  const envDir = process.env.CANON_DATA_DIR || "";
  const cwd = process.cwd();
  const candidates: string[] = [];

  // explicit files
  if (process.env.CANON_ALIAS_FILE) candidates.push(process.env.CANON_ALIAS_FILE);
  if (process.env.CANON_CARDS_FILE) candidates.push(process.env.CANON_CARDS_FILE);

  // directories to search for known filenames
  const dirs = [
    envDir,
    path.join(cwd, "data"),
    path.join(cwd, "..", "AI research (2)"),
    path.join(cwd, "..", "AI research"),
  ].filter(Boolean);

  const names = ["aliases.jsonl", "canonical_cards.jsonl"];
  for (const d of dirs) {
    for (const n of names) {
      candidates.push(path.join(d, n));
    }
  }

  const nextAlias = new Map<string, string>();
  const nextCards = new Map<string, { name: string; oracle_id?: string }>();

  // Built-in defaults
  const defaults = new Map<string, string>([
    ["l. bolt", "lightning bolt"],
    ["lightning bolt", "lightning bolt"],
    ["sol ring", "sol ring"],
  ]);

  const used: string[] = [];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const base = path.basename(p).toLowerCase();
    if (base.includes("aliases") && base.endsWith(".jsonl")) {
      used.push(p);
      for (const line of readLines(p)) {
        try {
          const j = JSON.parse(line);
          const a = String(j?.alias ?? j?.from ?? "").trim().toLowerCase();
          const c = String(j?.canonical ?? j?.to ?? j?.name ?? "").trim().toLowerCase();
          if (a && c) nextAlias.set(a, c);
        } catch {}
      }
    } else if (base.includes("canonical_cards") && base.endsWith(".jsonl")) {
      used.push(p);
      for (const line of readLines(p)) {
        try {
          const j = JSON.parse(line);
          const name = String(j?.name ?? "").trim();
          if (!name) continue;
          const key = name.toLowerCase();
          nextCards.set(key, { name, oracle_id: j?.oracle_id });
        } catch {}
      }
    }
  }

  if (nextAlias.size === 0) {
    for (const [k, v] of defaults) nextAlias.set(k, v);
  }

  aliasMap = nextAlias;
  cardMap = nextCards;
  loadedAt = now;
  lastFiles = used;
  dataVersion = computeVersion(used) + `:a${aliasMap.size}:c${cardMap.size}`;
}

export function canonicalize(input: string): { canonicalName: string; oracle_id?: string } {
  loadFilesIfNeeded();
  const key = String(input || "").trim().toLowerCase();
  if (!key) { misses++; return { canonicalName: "" }; }
  const mapped = aliasMap.get(key) || key;
  const card = cardMap.get(mapped) || cardMap.get(key);
  const out = { canonicalName: card?.name || mapped, oracle_id: card?.oracle_id };
  if (out.canonicalName) hits++; else misses++;
  return out;
}

export function getCanonicalStats() {
  return {
    hits,
    misses,
    loadedAt,
    ttlMs: TTL_MS,
    dataVersion,
    files: lastFiles,
    aliasEntries: aliasMap.size,
    cardEntries: cardMap.size,
  };
}

// test helper
export function __setTestData(aliases: Record<string, string>, cards: Array<{ name: string; oracle_id?: string }>) {
  aliasMap = new Map<string, string>(Object.entries(aliases || {}).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  cardMap = new Map<string, { name: string; oracle_id?: string }>();
  for (const c of cards || []) cardMap.set(String(c.name).toLowerCase(), { name: c.name, oracle_id: c.oracle_id });
  loadedAt = Date.now();
  dataVersion = `test:a${aliasMap.size}:c${cardMap.size}`;
  hits = 0; misses = 0; lastFiles = ["__test__"];  
}
