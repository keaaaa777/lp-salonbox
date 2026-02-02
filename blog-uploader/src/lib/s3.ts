import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { Readable } from "stream";
import { createTwoFilesPatch } from "diff";
import {
  CodeBuildClient,
  StartBuildCommand,
  type EnvironmentVariable,
} from "@aws-sdk/client-codebuild";
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandOutput,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { buildImageKey, buildPostKey } from "./packaging";
import type {
  ImageSelection,
  ImageSlot,
  OutArticle,
  PrefixDownloadResult,
  DeleteArticleResult,
  S3DiffItem,
  S3DiffSummary,
  PublishProgress,
  PreviewResult,
  PublishResult,
  PublisherSettings,
} from "./types";

type LogFn = (message: string) => void;

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".xml":
      return "application/xml; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".map":
      return "application/json; charset=utf-8";
    case ".webmanifest":
      return "application/manifest+json; charset=utf-8";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function normalizePrefix(prefix: string | undefined) {
  return (prefix ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
}

function isHtmlKey(key: string) {
  return key.endsWith(".html") || key.endsWith(".htm");
}

function extractTitleFromHtml(html: string) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch && titleMatch[1]) return titleMatch[1].trim();
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
  if (h1Match && h1Match[1]) return h1Match[1].trim();
  return "";
}

function stripPrefix(key: string, prefix: string) {
  if (!prefix) return key;
  const normalized = normalizePrefix(prefix);
  if (!normalized) return key;
  if (key.startsWith(`${normalized}/`)) {
    return key.slice(normalized.length + 1);
  }
  return key;
}

function isDatedFolderKey(key: string, prefix: string) {
  const rel = stripPrefix(key, prefix);
  const top = rel.split("/")[0] ?? "";
  return /^\d{8}/.test(top);
}

function formatTimestampForLog(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function resolveBlogNextDir(settings: PublisherSettings) {
  if (settings.blogNextDir) return path.resolve(settings.blogNextDir);
  return path.resolve(process.cwd(), "..", "blog-next");
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(command: string, args: string[], cwd: string) {
  const runDirect = () =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: "pipe",
        windowsHide: true,
        shell: false,
        env: process.env,
      });
      child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
      child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
      child.on("error", reject);
      child.on("close", (code, signal) => {
        if (code === 0) resolve();
        else {
          const reason = signal ? `signal ${signal}` : `code ${code}`;
          reject(new Error(`${command} ${args.join(" ")} failed with ${reason}`));
        }
      });
    });

  const runViaCmd = () =>
    new Promise<void>((resolve, reject) => {
      const cmd = process.env.ComSpec ?? "cmd.exe";
      const full = [command, ...args].join(" ");
      const child = spawn(cmd, ["/d", "/s", "/c", full], {
        cwd,
        stdio: "pipe",
        windowsHide: true,
        env: process.env,
      });
      child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
      child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
      child.on("error", reject);
      child.on("close", (code, signal) => {
        if (code === 0) resolve();
        else {
          const reason = signal ? `signal ${signal}` : `code ${code}`;
          reject(new Error(`${command} ${args.join(" ")} failed with ${reason}`));
        }
      });
    });

  if (process.platform !== "win32") {
    return runDirect();
  }
  return runDirect().catch((err) => {
    if (err && typeof err === "object" && (err as { code?: string }).code === "EINVAL") {
      console.warn("[publish] spawn EINVAL; retrying via cmd.exe");
      return runViaCmd();
    }
    throw err;
  });
}

function nodeCommand() {
  const isElectron = Boolean(process.versions && process.versions.electron);
  if (!isElectron) return process.execPath;
  return process.env.NODE_BINARY && process.env.NODE_BINARY.trim()
    ? process.env.NODE_BINARY.trim()
    : "node";
}

async function runBlogBuildSteps(blogDir: string, onLog?: LogFn) {
  const scriptsDir = path.join(blogDir, "scripts");
  const prebuildScript = path.join(scriptsDir, "prepare-image-folders.js");
  const postbuildSitemap = path.join(scriptsDir, "generate-sitemap.js");
  const postbuildNormalize = path.join(scriptsDir, "normalize-tag-paths.js");
  const nextBin = path.join(blogDir, "node_modules", "next", "dist", "bin", "next");

  const nodeBin = nodeCommand();
  onLog?.(`build: node=${nodeBin}`);
  onLog?.("build: prebuild start");
  await runCommand(nodeBin, [prebuildScript], blogDir);
  onLog?.("build: prebuild done");
  onLog?.("build: next build start");
  await runCommand(nodeBin, [nextBin, "build"], blogDir);
  onLog?.("build: next build done");
  onLog?.("build: postbuild sitemap start");
  await runCommand(nodeBin, [postbuildSitemap], blogDir);
  onLog?.("build: postbuild sitemap done");
  onLog?.("build: postbuild normalize start");
  await runCommand(nodeBin, [postbuildNormalize], blogDir);
  onLog?.("build: postbuild normalize done");
}

async function uploadMarkdown(
  s3: S3Client,
  settings: PublisherSettings,
  preview: PreviewResult
) {
  const bucket = settings.sourceBucket;
  if (!bucket) {
    throw new Error("PUBLISHER_SOURCE_BUCKET is required for source upload.");
  }
  const key = buildPostKey(settings, preview.slug);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: preview.markdownWithFrontmatter,
      ContentType: "text/markdown; charset=utf-8",
    })
  );
  return key;
}

async function uploadImages(
  s3: S3Client,
  settings: PublisherSettings,
  slug: string,
  selection: ImageSelection,
  onProgress?: (progress: PublishProgress) => void,
  progressState?: { done: number; total: number }
) {
  const bucket = settings.sourceBucket;
  if (!bucket) {
    throw new Error("PUBLISHER_SOURCE_BUCKET is required for source upload.");
  }
  const uploaded: string[] = [];

  const slots: ImageSlot[] = ["hero", "image1", "image2", "image3"];
  for (const slot of slots) {
    const sourcePath = selection[slot];
    if (!sourcePath) continue;
    const key = buildImageKey(settings, slug, slot, sourcePath);
    const body = fs.readFileSync(sourcePath);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentTypeFor(sourcePath),
      })
    );
    uploaded.push(key);
    if (progressState) {
      progressState.done += 1;
      onProgress?.({ phase: "source-progress", done: progressState.done, total: progressState.total });
    }
  }

  return uploaded;
}

async function writeLocalSources(
  settings: PublisherSettings,
  preview: PreviewResult,
  selection: ImageSelection
) {
  const blogDir = resolveBlogNextDir(settings);
  const postsDir = path.join(blogDir, "content", "posts");
  const markdownPath = path.join(postsDir, `${preview.slug}.md`);

  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(markdownPath, preview.markdownWithFrontmatter, "utf8");

  const publicDir = path.join(blogDir, "public");
  const slots: ImageSlot[] = ["hero", "image1", "image2", "image3"];
  for (const slot of slots) {
    const sourcePath = selection[slot];
    if (!sourcePath) continue;
    const key = buildImageKey(settings, preview.slug, slot, sourcePath);
    const destPath = path.join(publicDir, key);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(sourcePath, destPath);
  }

  return blogDir;
}

async function buildBlogIfNeeded(blogDir: string, onLog?: LogFn) {
  const nodeModulesDir = path.join(blogDir, "node_modules");
  if (!fs.existsSync(nodeModulesDir)) {
    await runCommand(npmCommand(), ["ci"], blogDir);
  }
  const outDir = path.join(blogDir, "out");
  const draftsBackup = fs.existsSync(outDir) ? backupDraftsDir(outDir) : null;
  if (fs.existsSync(outDir)) {
    const entries = fs.readdirSync(outDir);
    for (const entry of entries) {
      fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(outDir, { recursive: true });
  }
  try {
    await runBlogBuildSteps(blogDir, onLog);
  } catch (err) {
    if (fs.existsSync(outDir)) {
      restoreDraftsDir(outDir, draftsBackup);
    }
    throw err;
  }
  if (fs.existsSync(outDir)) {
    restoreDraftsDir(outDir, draftsBackup);
  }
}

const DRAFTS_DIR_NAME = "\u8a18\u4e8b\u539f\u7a3f";

function ensureDraftsDir(outDir: string) {
  const preferred = path.join(outDir, DRAFTS_DIR_NAME);
  fs.mkdirSync(preferred, { recursive: true });
  return preferred;
}

function backupDraftsDir(outDir: string) {
  const source = path.join(outDir, DRAFTS_DIR_NAME);
  if (!fs.existsSync(source)) return null;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "blog-next-drafts-"));
  const backupDir = path.join(tempRoot, DRAFTS_DIR_NAME);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.cpSync(source, backupDir, { recursive: true });
  return backupDir;
}

function restoreDraftsDir(outDir: string, backupDir: string | null) {
  if (!backupDir) return;
  const dest = ensureDraftsDir(outDir);
  fs.cpSync(backupDir, dest, { recursive: true });
  try {
    fs.rmSync(path.dirname(backupDir), { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
}

function saveDraftMarkdownToOut(
  blogDir: string,
  preview: PreviewResult
) {
  const outDir = path.join(blogDir, "out");
  const draftsDir = ensureDraftsDir(outDir);
  const fileName = `${preview.slug}.md`;
  const destPath = path.join(draftsDir, fileName);
  fs.writeFileSync(destPath, preview.markdownWithFrontmatter, "utf8");
}

function resolveS3LogDir(blogDir: string) {
  const root = path.resolve(blogDir, "..", "S3log");
  fs.mkdirSync(root, { recursive: true });
  const dirName = formatTimestampForLog();
  const fullPath = path.join(root, dirName);
  fs.mkdirSync(fullPath, { recursive: true });
  return fullPath;
}

function collectFiles(dir: string, baseDir = dir): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      files.push(path.relative(baseDir, fullPath));
    }
  }
  return files;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function listObjectsWithPrefix(
  s3: S3Client,
  bucket: string,
  prefix: string
) {
  const items: Array<{ key: string; size: number; eTag?: string }> = [];
  let continuationToken: string | undefined = undefined;
  do {
    const response: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    const contents = response.Contents ?? [];
    for (const obj of contents) {
      if (!obj.Key) continue;
      items.push({
        key: obj.Key,
        size: obj.Size ?? 0,
        eTag: obj.ETag?.replace(/"/g, ""),
      });
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return items;
}

async function snapshotProdPrefix(
  s3: S3Client,
  settings: PublisherSettings,
  blogDir: string,
  onLog?: LogFn
) {
  if (!settings.prodBucket) {
    throw new Error("PUBLISHER_PROD_BUCKET is required for snapshot.");
  }
  const prefix = normalizePrefix(settings.prodPrefix);
  const objects = await listObjectsWithPrefix(s3, settings.prodBucket, prefix);
  const snapshotDir = resolveS3LogDir(blogDir);
  onLog?.(
    `S3 snapshot: s3://${settings.prodBucket}/${prefix || ""} -> ${snapshotDir} (${objects.length} objects)`
  );
  const failedKeys: string[] = [];

  for (const obj of objects) {
    try {
      const rel = stripPrefix(obj.key, prefix);
      if (!rel || rel.endsWith("/")) {
        continue;
      }
      const response: GetObjectCommandOutput = await s3.send(
        new GetObjectCommand({ Bucket: settings.prodBucket, Key: obj.key })
      );
      if (!response.Body) throw new Error("S3 object body is empty.");
      const body = await streamToBuffer(response.Body as Readable);
      const destPath = path.join(snapshotDir, rel);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, body);
    } catch {
      failedKeys.push(obj.key);
    }
  }

  const manifest = {
    timestamp: new Date().toISOString(),
    bucket: settings.prodBucket,
    prefix,
    totalObjects: objects.length,
    failedKeys,
  };
  fs.writeFileSync(
    path.join(snapshotDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  onLog?.(
    failedKeys.length
      ? `S3 snapshot completed with failures: ${failedKeys.length}`
      : "S3 snapshot completed."
  );

  return { snapshotDir, objects, failedKeys };
}

async function deleteObjectsForPrefix(
  s3: S3Client,
  settings: PublisherSettings,
  objects: Array<{ key: string }>,
  onLog?: LogFn
) {
  if (!settings.prodBucket) {
    throw new Error("PUBLISHER_PROD_BUCKET is required for delete.");
  }
  if (!objects.length) return 0;
  onLog?.(`S3 delete start: s3://${settings.prodBucket}/${normalizePrefix(settings.prodPrefix) || ""}`);
  onLog?.(`S3 delete target count: ${objects.length}`);
  const batches = [];
  for (let i = 0; i < objects.length; i += 1000) {
    batches.push(objects.slice(i, i + 1000));
  }
  for (const batch of batches) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: settings.prodBucket,
        Delete: {
          Objects: batch.map((obj) => ({ Key: obj.key })),
          Quiet: true,
        },
      })
    );
  }
  return objects.length;
}

function getOutDir(settings: PublisherSettings) {
  const blogDir = resolveBlogNextDir(settings);
  return path.join(blogDir, "out");
}

function buildLocalIndex(outDir: string, prefix: string) {
  const files = collectFiles(outDir);
  const map = new Map<
    string,
    { fullPath: string; size: number; isHtml: boolean }
  >();
  for (const relPath of files) {
    const fullPath = path.join(outDir, relPath);
    const normalizedRel = relPath.replace(/\\/g, "/");
    const key = prefix ? `${prefix}/${normalizedRel}` : normalizedRel;
    const stat = fs.statSync(fullPath);
    map.set(key, {
      fullPath,
      size: stat.size,
      isHtml: isHtmlKey(key),
    });
  }
  return map;
}

export function listOutArticles(settings: PublisherSettings): OutArticle[] {
  const outDir = getOutDir(settings);
  if (!fs.existsSync(outDir)) {
    throw new Error(`out directory not found: ${outDir}`);
  }
  const excluded = new Set(["_next", "tags", "page", "salonbox", "search"]);
  const results: OutArticle[] = [];
  const files = collectFiles(outDir);
  for (const relPath of files) {
    const normalized = relPath.replace(/\\/g, "/");
    if (!normalized.endsWith("/index.html")) continue;
    if (!normalized.includes("/")) continue;
    const top = normalized.split("/")[0];
    if (excluded.has(top)) continue;
     if (!/^\d{8}/.test(top)) continue;
    const slug = normalized.split("/")[0];
    const fullPath = path.join(outDir, relPath);
    let title = "";
    try {
      const html = fs.readFileSync(fullPath, "utf8");
      title = extractTitleFromHtml(html);
    } catch {
      title = "";
    }
    results.push({
      slug,
      title: title || slug,
      path: normalized,
    });
  }
  results.sort((a, b) => a.slug.localeCompare(b.slug));
  return results;
}

export function deleteOutArticle(
  settings: PublisherSettings,
  slug: string
): DeleteArticleResult {
  const blogDir = resolveBlogNextDir(settings);
  const outDir = path.join(blogDir, "out");
  const removedPaths: string[] = [];
  const missingPaths: string[] = [];

  const targets = [
    path.join(outDir, slug),
    path.join(outDir, DRAFTS_DIR_NAME, `${slug}.md`),
    path.join(blogDir, "content", "posts", `${slug}.md`),
    path.join(blogDir, "content", "posts", `${slug}.mdx`),
    path.join(blogDir, "public", "images", "posts", slug),
  ];

  for (const target of targets) {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      removedPaths.push(target);
    } else {
      missingPaths.push(target);
    }
  }

  return { slug, removedPaths, missingPaths };
}

export async function rebuildOutAndSync(
  settings: PublisherSettings
) {
  const blogDir = resolveBlogNextDir(settings);
  await buildBlogIfNeeded(blogDir);

  let prodUploadCompleted = false;
  let cloudfrontInvalidated = false;
  if (settings.prodBucket) {
    const s3 = new S3Client({ region: settings.region });
    prodUploadCompleted = await uploadOutToS3(s3, settings, blogDir);
    cloudfrontInvalidated = await invalidateCloudFront(settings);
  }

  return { prodUploadCompleted, cloudfrontInvalidated };
}

export async function checkProdSyncState(settings: PublisherSettings): Promise<S3DiffSummary> {
  if (!settings.prodBucket) {
    throw new Error("PUBLISHER_PROD_BUCKET is required for S3 state check.");
  }
  const outDir = getOutDir(settings);
  if (!fs.existsSync(outDir)) {
    throw new Error(`out directory not found: ${outDir}`);
  }
  const prefix = normalizePrefix(settings.prodPrefix);
  const s3 = new S3Client({ region: settings.region });
  const s3Objects = await listObjectsWithPrefix(s3, settings.prodBucket, prefix);

  const localFolders = new Set<string>();
  const localEntries = fs.readdirSync(outDir, { withFileTypes: true });
  for (const entry of localEntries) {
    if (!entry.isDirectory()) continue;
    if (/^\d{8}/.test(entry.name)) {
      localFolders.add(entry.name);
    }
  }

  const s3Folders = new Set<string>();
  for (const obj of s3Objects) {
    if (!isDatedFolderKey(obj.key, prefix)) continue;
    const rel = stripPrefix(obj.key, prefix);
    const top = rel.split("/")[0] ?? "";
    if (top) s3Folders.add(top);
  }

  const keys = new Set<string>([...localFolders, ...s3Folders]);
  const items: S3DiffItem[] = [];
  const counts = { add: 0, update: 0, remove: 0, same: 0 };

  for (const key of keys) {
    const local = localFolders.has(key);
    const remote = s3Folders.has(key);
    let status: S3DiffItem["status"];
    if (local && !remote) status = "add";
    else if (!local && remote) status = "remove";
    else status = "same";
    counts[status] += 1;
    items.push({
      key,
      status,
      isHtml: false,
    });
  }

  items.sort((a, b) => a.key.localeCompare(b.key));
  return {
    bucket: settings.prodBucket,
    prefix,
    outDir,
    items,
    counts,
  };
}

export async function getHtmlDiffForKey(settings: PublisherSettings, key: string) {
  if (!settings.prodBucket) {
    throw new Error("PUBLISHER_PROD_BUCKET is required for diff.");
  }
  const outDir = getOutDir(settings);
  if (!fs.existsSync(outDir)) {
    throw new Error(`out directory not found: ${outDir}`);
  }
  const prefix = normalizePrefix(settings.prodPrefix);
  const rel = prefix && key.startsWith(`${prefix}/`) ? key.slice(prefix.length + 1) : key;
  const localPath = path.join(outDir, rel);
  if (!fs.existsSync(localPath)) {
    throw new Error(`local file not found: ${localPath}`);
  }
  const localStat = fs.statSync(localPath);
  const maxBytes = 2 * 1024 * 1024;
  if (localStat.size > maxBytes) {
    return "diff skipped: local file is too large.";
  }

  const s3 = new S3Client({ region: settings.region });
  const response: GetObjectCommandOutput = await s3.send(
    new GetObjectCommand({ Bucket: settings.prodBucket, Key: key })
  );
  if (!response.Body) {
    throw new Error("S3 object body is empty.");
  }
  const body = await streamToBuffer(response.Body as Readable);
  if (body.length > maxBytes) {
    return "diff skipped: S3 file is too large.";
  }
  const localText = fs.readFileSync(localPath, "utf8");
  const remoteText = body.toString("utf8");
  const patch = createTwoFilesPatch(
    `local:${rel}`,
    `s3:${key}`,
    localText,
    remoteText,
    "",
    "",
    { context: 3 }
  );
  return patch;
}

export async function downloadProdObjects(
  settings: PublisherSettings,
  keys: string[],
  targetDir: string
) {
  if (!settings.prodBucket) {
    throw new Error("PUBLISHER_PROD_BUCKET is required for download.");
  }
  const prefix = normalizePrefix(settings.prodPrefix);
  const s3 = new S3Client({ region: settings.region });
  const failedKeys: string[] = [];

  for (const key of keys) {
    try {
      const response: GetObjectCommandOutput = await s3.send(
        new GetObjectCommand({ Bucket: settings.prodBucket, Key: key })
      );
      if (!response.Body) throw new Error("S3 object body is empty.");
      const body = await streamToBuffer(response.Body as Readable);
      const rel = prefix && key.startsWith(`${prefix}/`) ? key.slice(prefix.length + 1) : key;
      const destPath = path.join(targetDir, rel);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, body);
    } catch {
      failedKeys.push(key);
    }
  }

  return {
    downloaded: keys.length - failedKeys.length,
    failedKeys,
  };
}

export async function downloadPrefixToOut(
  settings: PublisherSettings,
  onProgress?: (progress: { done: number; total: number }) => void
): Promise<PrefixDownloadResult> {
  if (!settings.prodBucket) {
    throw new Error("PUBLISHER_PROD_BUCKET is required for download.");
  }
  const outDir = getOutDir(settings);
  const prefix = normalizePrefix(settings.prodPrefix);
  const s3 = new S3Client({ region: settings.region });

  const objects = await listObjectsWithPrefix(s3, settings.prodBucket, prefix);
  const failedKeys: string[] = [];

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  let done = 0;
  const total = objects.length;
  for (const obj of objects) {
    try {
      const rel = stripPrefix(obj.key, prefix);
      if (!rel || rel.endsWith("/")) {
        continue;
      }
      const response: GetObjectCommandOutput = await s3.send(
        new GetObjectCommand({ Bucket: settings.prodBucket, Key: obj.key })
      );
      if (!response.Body) throw new Error("S3 object body is empty.");
      const body = await streamToBuffer(response.Body as Readable);
      const destPath = path.join(outDir, rel);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, body);
    } catch {
      failedKeys.push(obj.key);
    }
    done += 1;
    if (onProgress) onProgress({ done, total });
  }

  return {
    downloaded: objects.length - failedKeys.length,
    outDir,
    failedKeys,
  };
}

export async function syncProdToOut(
  settings: PublisherSettings,
  onLog?: LogFn,
  onProgress?: (progress: { done: number; total: number }) => void
) {
  if (!settings.prodBucket) {
    throw new Error("PUBLISHER_PROD_BUCKET is required for sync.");
  }
  const outDir = getOutDir(settings);
  if (!fs.existsSync(outDir)) {
    throw new Error(`out directory not found: ${outDir}`);
  }
  const prefix = normalizePrefix(settings.prodPrefix);
  const s3 = new S3Client({ region: settings.region });

  const blogDir = resolveBlogNextDir(settings);
  await buildBlogIfNeeded(blogDir, onLog);
  const snapshot = await snapshotProdPrefix(s3, settings, blogDir, onLog);
  if (snapshot.failedKeys.length) {
    throw new Error(
      `S3 snapshot failed for ${snapshot.failedKeys.length} objects. Aborting sync.`
    );
  }

  onProgress?.({ done: 0, total: snapshot.objects.length });
  await deleteObjectsForPrefix(s3, settings, snapshot.objects, (message) => {
    onLog?.(message);
  });
  let remaining = await listObjectsWithPrefix(s3, settings.prodBucket, prefix);
  if (remaining.length) {
    onLog?.(`S3 delete remaining count: ${remaining.length}`);
    await deleteObjectsForPrefix(s3, settings, remaining, (message) => {
      onLog?.(message);
    });
    remaining = await listObjectsWithPrefix(s3, settings.prodBucket, prefix);
    if (remaining.length) {
      onLog?.(`S3 delete still remaining: ${remaining.length}`);
      throw new Error(
        `S3 delete incomplete: ${remaining.length} objects still remain under prefix "${prefix}".`
      );
    }
  }
  onLog?.("S3 delete remaining count: 0");

  const uploadCompleted = await uploadOutToS3(s3, settings, blogDir, (progress) => {
    onProgress?.({ done: progress.done ?? 0, total: progress.total ?? 0 });
  }, onLog);
  const cloudfrontInvalidated = await invalidateCloudFront(settings);
  if (!cloudfrontInvalidated && settings.cloudfrontDistributionId) {
    console.warn("[sync] cloudfront invalidation skipped or failed.");
  }

  return {
    deleted: snapshot.objects.length,
    uploaded: uploadCompleted,
  };
}

async function uploadOutToS3(
  s3: S3Client,
  settings: PublisherSettings,
  blogDir: string,
  onProgress?: (progress: PublishProgress) => void,
  onLog?: LogFn
) {
  if (!settings.prodBucket) return false;
  const outDir = path.join(blogDir, "out");
  if (!fs.existsSync(outDir)) {
    throw new Error(`out directory not found: ${outDir}`);
  }

  const prefix = normalizePrefix(settings.prodPrefix);
  const files = collectFiles(outDir);
  onLog?.(`S3 upload target: s3://${settings.prodBucket}/${prefix || ""}`);
  onLog?.(`S3 upload files: ${files.length}`);
  let done = 0;
  const total = files.length;
  for (const relPath of files) {
    const fullPath = path.join(outDir, relPath);
    const normalizedRel = relPath.replace(/\\/g, "/");
    const key = prefix ? `${prefix}/${normalizedRel}` : normalizedRel;
    const body = fs.readFileSync(fullPath);
    await s3.send(
      new PutObjectCommand({
        Bucket: settings.prodBucket,
        Key: key,
        Body: body,
        ContentType: contentTypeFor(fullPath),
      })
    );
    done += 1;
    onProgress?.({ phase: "prod-upload-progress", done, total });
  }

  return true;
}

async function invalidateCloudFront(settings: PublisherSettings) {
  if (!settings.cloudfrontDistributionId) {
    console.warn("[publish] cloudfront distribution id not set; skipping invalidation.");
    return false;
  }
  const client = new CloudFrontClient({ region: settings.region });
  const prefix = normalizePrefix(settings.prodPrefix);
  const pathPattern = prefix ? `/${prefix}/*` : "/*";
  const callerReference = `${Date.now()}`;

  await client.send(
    new CreateInvalidationCommand({
      DistributionId: settings.cloudfrontDistributionId,
      InvalidationBatch: {
        CallerReference: callerReference,
        Paths: {
          Quantity: 1,
          Items: [pathPattern],
        },
      },
    })
  );
  return true;
}

async function startCodebuild(settings: PublisherSettings, slug: string) {
  if (!settings.codebuildProject) return false;

  const client = new CodeBuildClient({ region: settings.region });
  const environmentVariablesOverride: EnvironmentVariable[] = [
    {
      name: "BLOG_SLUG",
      value: slug,
      type: "PLAINTEXT" as const,
    },
  ];

  if (settings.sourceBucket) {
    environmentVariablesOverride.push(
      {
        name: "SOURCE_BUCKET",
        value: settings.sourceBucket,
        type: "PLAINTEXT" as const,
      },
      {
        name: "SOURCE_POSTS_PREFIX",
        value: settings.postsPrefix,
        type: "PLAINTEXT" as const,
      },
      {
        name: "SOURCE_IMAGES_PREFIX",
        value: settings.imagesPrefix,
        type: "PLAINTEXT" as const,
      }
    );
  }

  if (settings.prodBucket) {
    environmentVariablesOverride.push({
      name: "PROD_BUCKET",
      value: settings.prodBucket,
      type: "PLAINTEXT" as const,
    });
  }

  if (settings.prodPrefix) {
    environmentVariablesOverride.push({
      name: "PROD_PREFIX",
      value: settings.prodPrefix,
      type: "PLAINTEXT" as const,
    });
  }

  if (settings.cloudfrontDistributionId) {
    environmentVariablesOverride.push({
      name: "CLOUDFRONT_DISTRIBUTION_ID",
      value: settings.cloudfrontDistributionId,
      type: "PLAINTEXT" as const,
    });
  }

  await client.send(
    new StartBuildCommand({
      projectName: settings.codebuildProject,
      environmentVariablesOverride,
    })
  );
  return true;
}

export async function publishToS3(
  settings: PublisherSettings,
  preview: PreviewResult,
  selection: ImageSelection,
  onProgress?: (progress: PublishProgress) => void,
  onLog?: LogFn
): Promise<PublishResult> {
  const s3 = new S3Client({ region: settings.region });

  onProgress?.({ phase: "start" });
  const uploadedKeys: string[] = [];
  if (settings.sourceBucket) {
    const total = 1 + Object.values(selection).filter(Boolean).length;
    const progressState = { done: 0, total };
    onProgress?.({ phase: "source-progress", done: 0, total });
    const postKey = await uploadMarkdown(s3, settings, preview);
    uploadedKeys.push(postKey);
    progressState.done += 1;
    onProgress?.({ phase: "source-progress", done: progressState.done, total: progressState.total });

    const imageKeys = await uploadImages(
      s3,
      settings,
      preview.slug,
      selection,
      onProgress,
      progressState
    );
    uploadedKeys.push(...imageKeys);
  }

  let prodUploadCompleted = false;
  let cloudfrontInvalidated = false;
  const localBuildEnabled = Boolean(settings.localBuildEnabled);

  if (localBuildEnabled) {
    if (!settings.prodBucket) {
      throw new Error("PUBLISHER_PROD_BUCKET is required when PUBLISHER_LOCAL_BUILD=1.");
    }
    onProgress?.({ phase: "local-build-start" });
    const blogDir = await writeLocalSources(settings, preview, selection);
    await buildBlogIfNeeded(blogDir, onLog);
    onProgress?.({ phase: "local-build-done" });
    saveDraftMarkdownToOut(blogDir, preview);
    const snapshot = await snapshotProdPrefix(s3, settings, blogDir, onLog);
    if (snapshot.failedKeys.length) {
      throw new Error(
        `S3 snapshot failed for ${snapshot.failedKeys.length} objects. Aborting publish.`
      );
    }
    await deleteObjectsForPrefix(s3, settings, snapshot.objects, onLog);
    const prefix = normalizePrefix(settings.prodPrefix);
    let remaining = await listObjectsWithPrefix(s3, settings.prodBucket, prefix);
    if (remaining.length) {
      onLog?.(`S3 delete remaining count: ${remaining.length}`);
      await deleteObjectsForPrefix(s3, settings, remaining, onLog);
      remaining = await listObjectsWithPrefix(s3, settings.prodBucket, prefix);
      if (remaining.length) {
        onLog?.(`S3 delete still remaining: ${remaining.length}`);
        throw new Error(
          `S3 delete incomplete: ${remaining.length} objects still remain under prefix "${prefix}".`
        );
      }
    }
    onLog?.("S3 delete remaining count: 0");
    prodUploadCompleted = await uploadOutToS3(s3, settings, blogDir, onProgress, onLog);
    onProgress?.({ phase: "prod-upload-done" });
    cloudfrontInvalidated = await invalidateCloudFront(settings);
    if (!cloudfrontInvalidated && settings.cloudfrontDistributionId) {
      console.warn("[publish] cloudfront invalidation skipped or failed.");
    }
    if (cloudfrontInvalidated) onProgress?.({ phase: "cloudfront-done" });
  }

  const codebuildStarted = localBuildEnabled
    ? false
    : await startCodebuild(settings, preview.slug);
  if (codebuildStarted) onProgress?.({ phase: "codebuild-done" });

  onProgress?.({ phase: "done" });
  return {
    slug: preview.slug,
    uploadedKeys,
    codebuildStarted,
    localBuildEnabled,
    prodUploadCompleted,
    cloudfrontInvalidated,
  };
}
