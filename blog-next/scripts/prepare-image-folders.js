const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "content", "posts");
const PUBLIC_DIR = path.join(ROOT, "public");
const SAMPLE_IMAGE = path.join(PUBLIC_DIR, "sample.webp");

const IMAGE_KEYS = ["ogImage", "hero", "image1", "image2", "image3"];
const DEFAULT_IMAGE_FILES = [
  "hero.webp",
  "figure-01.webp",
  "figure-02.webp",
  "figure-03.webp",
];

function isString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function ensureDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    return false;
  }
  fs.mkdirSync(dirPath, { recursive: true });
  return true;
}

function createFoldersFromFrontmatter(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data } = matter(raw);

  const createdDirs = new Set();

  IMAGE_KEYS.forEach((key) => {
    const value = data[key];
    if (!isString(value)) return;
    if (!value.startsWith("/")) return;
    const withoutLeadingSlash = value.slice(1);
    const fullPath = path.join(PUBLIC_DIR, withoutLeadingSlash);
    const dirPath = path.dirname(fullPath);
    const created = ensureDir(dirPath);
    if (created) {
      createdDirs.add(dirPath);
    }
  });

  if (!fs.existsSync(SAMPLE_IMAGE) || createdDirs.size === 0) {
    return;
  }

  createdDirs.forEach((dirPath) => {
    DEFAULT_IMAGE_FILES.forEach((fileName) => {
      const target = path.join(dirPath, fileName);
      if (fs.existsSync(target)) return;
      fs.copyFileSync(SAMPLE_IMAGE, target);
    });
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
