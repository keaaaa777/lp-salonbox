import path from "path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import dotenv from "dotenv";
import { preparePreview } from "./lib/packaging";
import { publishToS3 } from "./lib/s3";
import type { ImageSelection, PreviewResult, PublisherSettings } from "./lib/types";

const envPath = path.resolve(__dirname, "..", ".env");
const envResult = dotenv.config({ path: envPath, override: true });
if (envResult.error) {
  console.warn(`[env] failed to load .env: path=${envPath} cwd=${process.cwd()} err=${envResult.error.message}`);
} else {
  const keys = Object.keys(envResult.parsed ?? {}).sort().join(",");
  console.log(`[env] loaded .env: path=${envPath} cwd=${process.cwd()} keys=${keys || "none"}`);
}

let mainWindow: BrowserWindow | null = null;
let latestPreview: PreviewResult | null = null;
let latestSelection: ImageSelection = {};
let latestSettings: PublisherSettings | null = null;

function rendererPath() {
  return path.resolve(__dirname, "../src/renderer/index.html");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    webPreferences: {
      preload: path.resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(rendererPath());
}

function readSettingsFromEnv(): PublisherSettings {
  const region = process.env.PUBLISHER_AWS_REGION?.trim() ?? "";
  const sourceBucket = process.env.PUBLISHER_SOURCE_BUCKET?.trim() || undefined;
  const postsPrefix = process.env.PUBLISHER_POSTS_PREFIX?.trim() || "posts";
  const imagesPrefix = process.env.PUBLISHER_IMAGES_PREFIX?.trim() || "images";
  const prodBucket = process.env.PUBLISHER_PROD_BUCKET?.trim() || undefined;
  const prodPrefix = process.env.PUBLISHER_PROD_PREFIX?.trim() || undefined;
  const cloudfrontDistributionId =
    process.env.PUBLISHER_CLOUDFRONT_DISTRIBUTION_ID?.trim() || undefined;
  const codebuildProject = process.env.PUBLISHER_CODEBUILD_PROJECT?.trim() || undefined;
  const localBuildEnabled =
    /^(1|true|yes|on)$/i.test(process.env.PUBLISHER_LOCAL_BUILD?.trim() ?? "");
  const blogNextDir = process.env.PUBLISHER_BLOG_NEXT_DIR?.trim() || undefined;

  return {
    region,
    sourceBucket,
    postsPrefix,
    imagesPrefix,
    prodBucket,
    prodPrefix,
    cloudfrontDistributionId,
    codebuildProject,
    localBuildEnabled,
    blogNextDir,
  };
}

function assertPublishSettings(settings: PublisherSettings) {
  if (!settings.region) {
    const value = process.env.PUBLISHER_AWS_REGION ?? "";
    const hint = envResult?.error ? ` envError=${envResult.error.message}` : "";
    throw new Error(
      `PUBLISHER_AWS_REGION is required. envPath=${envPath} cwd=${process.cwd()} value=${value}${hint}`
    );
  }
  if (!settings.sourceBucket && !settings.localBuildEnabled) {
    throw new Error("PUBLISHER_SOURCE_BUCKET is required unless PUBLISHER_LOCAL_BUILD=1.");
  }
}

function maskKey(value: string | undefined) {
  if (!value) return "unset";
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

async function logAwsCallerIdentity(context: string) {
  const region = process.env.PUBLISHER_AWS_REGION?.trim() || process.env.AWS_REGION?.trim();
  const client = new STSClient({ region });
  try {
    const identity = await client.send(new GetCallerIdentityCommand({}));
    console.log(
      `[aws] (${context}) caller identity: arn=${identity.Arn ?? "unknown"} account=${identity.Account ?? "unknown"}`
    );
  } catch (err) {
    console.warn(`[aws] (${context}) failed to resolve caller identity:`, err);
  } finally {
    console.log(
      `[aws] (${context}) env: region=${region || "unset"} accessKey=${maskKey(
        process.env.AWS_ACCESS_KEY_ID
      )} profile=${process.env.AWS_PROFILE ?? "unset"}`
    );
  }
}

ipcMain.handle("select-markdown", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select markdown file",
    filters: [{ name: "Markdown", extensions: ["md", "mdx"] }],
    properties: ["openFile"],
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("select-image", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select image",
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] },
    ],
    properties: ["openFile"],
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle(
  "generate-preview",
  async (
    _event,
    payload: { markdownPath: string; selection: ImageSelection }
  ) => {
    latestSelection = { ...payload.selection };
    latestSettings = readSettingsFromEnv();
    latestPreview = await preparePreview(payload.markdownPath, payload.selection, latestSettings);
    return latestPreview;
  }
);

ipcMain.handle("publish", async () => {
  if (!latestPreview || !latestSettings) {
    throw new Error("Generate a preview before publishing.");
  }
  latestSettings = readSettingsFromEnv();
  assertPublishSettings(latestSettings);
  await logAwsCallerIdentity("publish");
  return publishToS3(latestSettings, latestPreview, latestSelection);
});

app.whenReady().then(() => {
  createWindow();
  logAwsCallerIdentity("startup");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

