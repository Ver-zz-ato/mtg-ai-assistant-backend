/** Date-prefixed slug for marketing-radar auto-publish. */
export function slugifyBlogTitle(title: string, date?: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  const d = date ?? new Date().toISOString().slice(0, 10);
  return `${d}-${base || "manatap-update"}`.replace(/--+/g, "-");
}

export function estimateReadTime(content: string): string {
  const words = content.split(/\s+/).filter(Boolean).length;
  const mins = Math.max(3, Math.ceil(words / 200));
  return `${mins} min read`;
}

export function excerptFromContent(content: string): string {
  const plain = content.replace(/^#+\s+/gm, "").replace(/\*\*/g, "");
  const para = plain.split("\n").find((l) => l.trim().length > 40) || plain;
  const trimmed = para.trim();
  return trimmed.slice(0, 200) + (trimmed.length > 200 ? "…" : "");
}

export function titleFromContent(content: string): string {
  const titleLine = content.trim().split("\n").find((l) => l.startsWith("# "));
  return titleLine ? titleLine.replace(/^#\s+/, "").trim() : "ManaTap Blog";
}

export function normalizeBlogSlug(slug: string): string {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
