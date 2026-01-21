const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "content", "posts");
const PUBLIC_DIR = path.join(ROOT, "public");

const IMAGE_KEYS = ["ogImage", "hero", "image1", "image2", "image3"];

function isString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createFoldersFromFrontmatter(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data } = matter(raw);

  IMAGE_KEYS.forEach((key) => {
    const value = data[key];
    if (!isString(value)) return;
    if (!value.startsWith("/")) return;
    const withoutLeadingSlash = value.slice(1);
    const fullPath = path.join(PUBLIC_DIR, withoutLeadingSlash);
    const dirPath = path.dirname(fullPath);
    ensureDir(dirPath);
  });
}

function main() {
  if (!fs.existsSync(POSTS_DIR)) {
    return;
  }
  const files = fs
    .readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .map((file) => path.join(POSTS_DIR, file));

  files.forEach(createFoldersFromFrontmatter);
}

main();
