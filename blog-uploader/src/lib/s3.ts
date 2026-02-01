import fs from "fs";
import path from "path";
import { spawn } from "child_process";
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
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { buildImageKey, buildPostKey } from "./packaging";
import type {
  ImageSelection,
  ImageSlot,
  PreviewResult,
  PublishResult,
  PublisherSettings,
} from "./types";

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

function resolveBlogNextDir(settings: PublisherSettings) {
  if (settings.blogNextDir) return path.resolve(settings.blogNextDir);
  return path.resolve(process.cwd(), "..", "blog-next");
}

function npmCommand() {
  return "npm";
}

function quoteForCmd(value: string) {
  if (!/[\s"&|<>^]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", [command, ...args].map(quoteForCmd).join(" ")],
            { cwd, stdio: "inherit", windowsHide: true }
          )
        : spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    });
  });
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
  selection: ImageSelection
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

async function buildBlogIfNeeded(blogDir: string) {
  const nodeModulesDir = path.join(blogDir, "node_modules");
  if (!fs.existsSync(nodeModulesDir)) {
    await runCommand(npmCommand(), ["ci"], blogDir);
  }
  try {
    await runCommand(npmCommand(), ["run", "build"], blogDir);
  } catch (err) {
    const outDir = path.join(blogDir, "out");
    const hasOut =
      fs.existsSync(outDir) && fs.readdirSync(outDir, { withFileTypes: true }).length > 0;
    if (hasOut) {
      return;
    }
    throw err;
  }
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

async function uploadOutToS3(
  s3: S3Client,
  settings: PublisherSettings,
  blogDir: string
) {
  if (!settings.prodBucket) return false;
  const outDir = path.join(blogDir, "out");
  if (!fs.existsSync(outDir)) {
    throw new Error(`out directory not found: ${outDir}`);
  }

  const prefix = normalizePrefix(settings.prodPrefix);
  const files = collectFiles(outDir);
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
  }

  return true;
}

async function invalidateCloudFront(settings: PublisherSettings) {
  if (!settings.cloudfrontDistributionId) return false;
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
  selection: ImageSelection
): Promise<PublishResult> {
  const s3 = new S3Client({ region: settings.region });

  const uploadedKeys: string[] = [];
  if (settings.sourceBucket) {
    const postKey = await uploadMarkdown(s3, settings, preview);
    uploadedKeys.push(postKey);

    const imageKeys = await uploadImages(s3, settings, preview.slug, selection);
    uploadedKeys.push(...imageKeys);
  }

  let prodUploadCompleted = false;
  let cloudfrontInvalidated = false;
  const localBuildEnabled = Boolean(settings.localBuildEnabled);

  if (localBuildEnabled) {
    if (!settings.prodBucket) {
      throw new Error("PUBLISHER_PROD_BUCKET is required when PUBLISHER_LOCAL_BUILD=1.");
    }
    const blogDir = await writeLocalSources(settings, preview, selection);
    await buildBlogIfNeeded(blogDir);
    prodUploadCompleted = await uploadOutToS3(s3, settings, blogDir);
    cloudfrontInvalidated = await invalidateCloudFront(settings);
  }

  const codebuildStarted = localBuildEnabled
    ? false
    : await startCodebuild(settings, preview.slug);

  return {
    slug: preview.slug,
    uploadedKeys,
    codebuildStarted,
    localBuildEnabled,
    prodUploadCompleted,
    cloudfrontInvalidated,
  };
}
