import "dotenv/config";
import path from "path";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { preparePreview } from "./lib/packaging";
import {
  checkProdSyncState,
  downloadPrefixToOut,
  getHtmlDiffForKey,
  deleteOutArticle,
  rebuildOutAndSync,
  listOutArticles,
  publishToS3,
  syncProdToOut,
} from "./lib/s3";
import type { ImageSelection, PreviewResult, PublisherSettings, PublishProgress } from "./lib/types";

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
  if (!settings.region) throw new Error("PUBLISHER_AWS_REGION is required.");
  if (!settings.sourceBucket && !settings.localBuildEnabled) {
    throw new Error("PUBLISHER_SOURCE_BUCKET is required unless PUBLISHER_LOCAL_BUILD=1.");
  }
}

function sendProgress(event: string, payload: Record<string, unknown>) {
  if (!mainWindow) return;
  mainWindow.webContents.send(event, payload);
}

function sendLog(message: string) {
  if (!mainWindow) return;
  mainWindow.webContents.send("prod-log", { message });
}

function mapPublishProgress(progress: PublishProgress) {
  const { phase } = progress;
  const safeDone = progress.done ?? 0;
  const safeTotal = progress.total ?? 0;
  if (phase === "source-progress" && safeTotal) {
    return Math.round((safeDone / safeTotal) * 30);
  }
  if (phase === "local-build-start") return 35;
  if (phase === "local-build-done") return 55;
  if (phase === "prod-upload-progress" && safeTotal) {
    return 55 + Math.round((safeDone / safeTotal) * 35);
  }
  if (phase === "prod-upload-done") return 90;
  if (phase === "cloudfront-done") return 95;
  if (phase === "codebuild-done") return 95;
  if (phase === "done") return 100;
  return undefined;
}

function assertProdSettings(settings: PublisherSettings) {
  if (!settings.region) {
    throw new Error("PUBLISHER_AWS_REGION is required.");
  }
  if (!settings.prodBucket) {
    throw new Error("PUBLISHER_PROD_BUCKET is required for prod sync.");
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
  return publishToS3(latestSettings, latestPreview, latestSelection, (progress) => {
    sendProgress("publish-progress", {
      ...progress,
      percent: mapPublishProgress(progress),
    });
  }, sendLog);
});

ipcMain.handle("check-prod-state", async () => {
  const settings = readSettingsFromEnv();
  assertProdSettings(settings);
  return checkProdSyncState(settings);
});

ipcMain.handle("get-html-diff", async (_event, payload: { key: string }) => {
  const settings = readSettingsFromEnv();
  assertProdSettings(settings);
  return getHtmlDiffForKey(settings, payload.key);
});

ipcMain.handle(
  "download-prod-prefix",
  async () => {
    const settings = readSettingsFromEnv();
    assertProdSettings(settings);
    sendProgress("prod-download-progress", { phase: "start" });
    const result = await downloadPrefixToOut(settings, (progress) => {
      sendProgress("prod-download-progress", { phase: "progress", ...progress });
    });
    sendProgress("prod-download-progress", { phase: "done", ...result });
    return result;
  }
);

ipcMain.handle("sync-prod", async () => {
  const settings = readSettingsFromEnv();
  assertProdSettings(settings);
  sendProgress("sync-progress", { phase: "start" });
  const result = await syncProdToOut(settings, sendLog, (progress) => {
    sendProgress("sync-progress", { phase: "progress", ...progress });
  });
  sendProgress("sync-progress", { phase: "done", ...result });
  return result;
});

ipcMain.handle("list-out-articles", async () => {
  const settings = readSettingsFromEnv();
  return listOutArticles(settings);
});

ipcMain.handle("delete-out-article", async (_event, payload: { slug: string }) => {
  const settings = readSettingsFromEnv();
  return deleteOutArticle(settings, payload.slug);
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
