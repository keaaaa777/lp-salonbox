import { createHash } from "crypto";

function toAsciiSlug(value: string) {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug;
}

function hashTag(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

export function buildTagSlugMap(tags: string[]) {
  const unique = Array.from(new Set(tags.map((tag) => String(tag))));
  const tagToSlug = new Map<string, string>();
  const slugToTag = new Map<string, string>();
  const used = new Set<string>();

  unique.forEach((tag) => {
    const base = toAsciiSlug(tag);
    const hash = hashTag(tag);
    let slug = base || `tag-${hash}`;
    if (used.has(slug)) {
      slug = base ? `${base}-${hash}` : `tag-${hash}`;
    }
    let counter = 1;
    while (used.has(slug)) {
      slug = `${slug}-${counter}`;
      counter += 1;
    }
    used.add(slug);
    tagToSlug.set(tag, slug);
    slugToTag.set(slug, tag);
  });

  return { tagToSlug, slugToTag };
}
