const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const SITE_URL = process.env.SITE_URL || "https://mactism-products.com";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/salonbox/blog";
const POSTS_PER_PAGE = 6;

const postsDirectory = path.join(process.cwd(), "content", "posts");
const outDirectory = path.join(process.cwd(), "out");

function ensureLeadingSlash(value) {
  if (!value.startsWith("/")) return `/${value}`;
  return value;
}

function trimTrailingSlash(value) {
  return value.endsWith("/") && value !== "/" ? value.slice(0, -1) : value;
}

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeBasePath(value) {
  if (!value) return "";
  const normalized = ensureLeadingSlash(value);
  return trimTrailingSlash(normalized);
}

const normalizedBasePath = normalizeBasePath(BASE_PATH);

function buildUrl(pathname) {
  const normalizedPath = ensureLeadingSlash(pathname);
  const fullPath =
    normalizedBasePath === ""
      ? normalizedPath
      : `${normalizedBasePath}${normalizedPath}`;
  return new URL(withTrailingSlash(fullPath), SITE_URL).toString();
}

function toLastmod(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function readPosts() {
  if (!fs.existsSync(postsDirectory)) return [];
  const files = fs
    .readdirSync(postsDirectory)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"));

  return files.map((file) => {
    const slug = file.replace(/\.mdx?$/, "");
    const sourcePath = path.join(postsDirectory, file);
    const fileContents = fs.readFileSync(sourcePath, "utf8");
    const { data } = matter(fileContents);
    return {
      slug,
      date: typeof data.date === "string" ? data.date : "",
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    };
  });
}

function buildSitemap() {
  const urls = [];
  const posts = readPosts();
  const totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));

  urls.push({ loc: buildUrl("/") });
  urls.push({ loc: buildUrl("/search/") });
  urls.push({ loc: buildUrl("/common/") });
  urls.push({ loc: buildUrl("/hair/") });
  urls.push({ loc: buildUrl("/esthetic/") });

  for (let page = 2; page <= totalPages; page += 1) {
    urls.push({ loc: buildUrl(`/page/${page}/`) });
  }

  const tagSet = new Set();
  posts.forEach((post) => {
    post.tags.forEach((tag) => tagSet.add(tag));
    const lastmod = toLastmod(post.date);
    urls.push({
      loc: buildUrl(`/${post.slug}/`),
      lastmod: lastmod ?? undefined,
    });
  });

  Array.from(tagSet).forEach((tag) => {
    urls.push({ loc: buildUrl(`/tags/${encodeURIComponent(tag)}/`) });
  });

  const body = urls
    .map((url) => {
      const lastmod = url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : "";
      return `  <url><loc>${url.loc}</loc>${lastmod}</url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function writeSitemap() {
  if (!fs.existsSync(outDirectory)) {
    throw new Error(
      "out/ が見つかりません。npm run build でエクスポート後に実行してください。"
    );
  }
  const sitemap = buildSitemap();
  const outputPath = path.join(outDirectory, "sitemap.xml");
  fs.writeFileSync(outputPath, sitemap, "utf8");
  return outputPath;
}

try {
  const outputPath = writeSitemap();
  console.log(`sitemap.xml generated: ${outputPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
