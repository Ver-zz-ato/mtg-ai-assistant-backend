export type BlogSeoFlag =
  | "missing_h1"
  | "thin_blog"
  | "missing_internal_links"
  | "missing_commander_link";

export function validateBlogSeo(
  content: string,
  opts?: { expectCommanderLink?: boolean }
): BlogSeoFlag[] {
  const flags: BlogSeoFlag[] = [];
  const trimmed = content.trim();

  if (!/^#\s+.+/m.test(trimmed)) {
    flags.push("missing_h1");
  }

  const words = trimmed.split(/\s+/).filter(Boolean).length;
  if (words < 600) {
    flags.push("thin_blog");
  }

  const linkCount = (trimmed.match(/https?:\/\/(?:www\.)?manatap\.ai/gi) ?? []).length;
  if (linkCount < 3) {
    flags.push("missing_internal_links");
  }

  if (opts?.expectCommanderLink && !/\/commanders\//i.test(trimmed)) {
    flags.push("missing_commander_link");
  }

  return flags;
}
