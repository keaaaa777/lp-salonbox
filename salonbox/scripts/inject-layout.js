const fs = require("fs");
const path = require("path");

const salonboxRoot = path.join(process.cwd(), "salonbox");
const baseIndex = path.join(salonboxRoot, "index.html");
const targets = [
  path.join(salonboxRoot, "hair", "index.html"),
  path.join(salonboxRoot, "esthetic", "index.html"),
];

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function getBlock(html, label) {
  const pattern = new RegExp(
    `<!-- ===== ${label} ===== -->[\\s\\S]*?<\\/${label.toLowerCase()}>`
  );
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`${label} block not found in ${baseIndex}`);
  }
  return match[0];
}

function prefixRelativeUrls(html, basePrefix) {
  if (!basePrefix) return html;
  const prefix = basePrefix.replace(/\\/g, "/");
  const withTrailing = prefix.endsWith("/") ? prefix : `${prefix}/`;

  const replaceAttr = (attr) =>
    new RegExp(`${attr}="(?!https?:|#|mailto:|tel:)([^"]+)"`, "g");

  return html
    .replace(replaceAttr("href"), `${"href"}="${withTrailing}$1"`)
    .replace(replaceAttr("src"), `${"src"}="${withTrailing}$1"`);
}

function applyBlocks(targetHtml, headerBlock, footerBlock) {
  const headerPattern = /<!-- ===== Header ===== -->[\s\S]*?<\/header>/;
  const footerPattern = /<!-- ===== Footer ===== -->[\s\S]*?<\/footer>/;
  if (!headerPattern.test(targetHtml)) {
    throw new Error("Header block not found in target.");
  }
  if (!footerPattern.test(targetHtml)) {
    throw new Error("Footer block not found in target.");
  }
  return targetHtml
    .replace(headerPattern, headerBlock)
    .replace(footerPattern, footerBlock);
}

function relativePrefix(targetPath) {
  const fromDir = path.dirname(targetPath);
  const rel = path.relative(fromDir, salonboxRoot);
  if (!rel || rel === ".") return "";
  return rel;
}

const baseHtml = readFile(baseIndex);
const baseHeader = getBlock(baseHtml, "Header");
const baseFooter = getBlock(baseHtml, "Footer");

targets.forEach((target) => {
  const targetHtml = readFile(target);
  const prefix = relativePrefix(target);
  const header = prefixRelativeUrls(baseHeader, prefix);
  const footer = prefixRelativeUrls(baseFooter, prefix);
  const updated = applyBlocks(targetHtml, header, footer);
  writeFile(target, updated);
});

console.log("Header/Footer injected into hair/esthetic.");
