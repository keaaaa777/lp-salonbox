const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "content", "posts");
const destDir = path.join(projectRoot, "out", "md-sources");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isMarkdownFile(name) {
  return name.endsWith(".md") || name.endsWith(".mdx");
}

function copyMarkdownFiles(fromDir, toDir) {
  if (!fs.existsSync(fromDir)) return;
  ensureDir(toDir);

  const entries = fs.readdirSync(fromDir, { withFileTypes: true });
  entries.forEach((entry) => {
    const sourcePath = path.join(fromDir, entry.name);
    const destPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      copyMarkdownFiles(sourcePath, destPath);
      return;
    }

    if (entry.isFile() && isMarkdownFile(entry.name)) {
      fs.copyFileSync(sourcePath, destPath);
    }
  });
}

copyMarkdownFiles(sourceDir, destDir);
