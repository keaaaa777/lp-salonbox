import path from "path";
import type GithubSluggerType from "github-slugger";

const dynamicImport = new Function(
  "modulePath",
  "return import(modulePath)"
) as (modulePath: string) => Promise<unknown>;

let sluggerImport: Promise<{ default: typeof GithubSluggerType }> | null = null;

async function loadSlugger() {
  if (!sluggerImport) {
    sluggerImport = dynamicImport("github-slugger") as Promise<{
      default: typeof GithubSluggerType;
    }>;
  }
  return sluggerImport;
}

export async function deriveSlug(inputPath: string, frontmatterSlug?: unknown) {
  const raw = typeof frontmatterSlug === "string" && frontmatterSlug.trim()
    ? frontmatterSlug.trim()
    : path.basename(inputPath).replace(/\.mdx?$/i, "");

  const { default: GithubSlugger } = await loadSlugger();
  const slugger = new GithubSlugger();
  const slug = slugger.slug(raw);
  return slug || "untitled-post";
}
