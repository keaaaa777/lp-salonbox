const fs = require("fs");
const path = require("path");

const outDirectory = path.join(process.cwd(), "out");
const tagsDirectory = path.join(outDirectory, "tags");

function decodeFolderName(name) {
  try {
    return decodeURIComponent(name);
  } catch (error) {
    return null;
  }
}

function ensureDirectory(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.mkdirSync(target, { recursive: true });
}

function copyDirectory(source, target) {
  ensureDirectory(target);
  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function normalizeTagFolders() {
  if (!fs.existsSync(tagsDirectory)) return;
  const entries = fs
    .readdirSync(tagsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  entries.forEach((entry) => {
    const decoded = decodeFolderName(entry);
    if (!decoded || decoded === entry) return;
    if (decoded.includes("/") || decoded.includes("\\")) return;
    const source = path.join(tagsDirectory, entry);
    const target = path.join(tagsDirectory, decoded);
    copyDirectory(source, target);
  });
}

try {
  normalizeTagFolders();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
