import "dotenv/config";
import path from "path";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "fs";
import path from "path";
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
  const stgBucket = process.env.PUBLISHER_STG_BUCKET?.trim() || undefined;
  const stgPrefix = process.env.PUBLISHER_STG_PREFIX?.trim() || undefined;
  const prodCloudfrontDistributionId =
    process.env.PUBLISHER_PROD_CLOUDFRONT_DISTRIBUTION_ID?.trim() || undefined;
  const stgCloudfrontDistributionId =
    process.env.PUBLISHER_STG_CLOUDFRONT_DISTRIBUTION_ID?.trim() || undefined;
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
    stgBucket,
    stgPrefix,
    prodCloudfrontDistributionId,
    stgCloudfrontDistributionId,
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

type PublishTarget = "prod" | "stg";

function applyPublishTarget(settings: PublisherSettings, target: PublishTarget) {
  if (target === "prod") {
    return {
      ...settings,
      cloudfrontDistributionId:
        settings.prodCloudfrontDistributionId ?? settings.cloudfrontDistributionId,
    };
  }
  if (!settings.stgBucket) {
    throw new Error("PUBLISHER_STG_BUCKET is required for stg sync.");
  }
  return {
    ...settings,
    prodBucket: settings.stgBucket,
    prodPrefix: settings.stgPrefix,
    cloudfrontDistributionId:
      settings.stgCloudfrontDistributionId ?? settings.cloudfrontDistributionId,
  };
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

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select folder",
    properties: ["openDirectory"],
  });

  if (result.canceled || !result.filePaths[0]) {
    return { markdownPath: null, images: {} };
  }

  const dir = result.filePaths[0];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

  const markdown = files.find((name) => name.endsWith(".md") || name.endsWith(".mdx"));

  const findImage = (base: string) => {
    const match = files.find((name) => {
      const lower = name.toLowerCase();
      if (!lower.startsWith(base)) return false;
      const ext = path.extname(lower);
      return [".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg"].includes(ext);
    });
    return match ? path.join(dir, match) : null;
  };

  const images = {
    hero: findImage("hero"),
    image1: findImage("figure-01"),
    image2: findImage("figure-02"),
    image3: findImage("figure-03"),
  };

  return {
    markdownPath: markdown ? path.join(dir, markdown) : null,
    images,
  };
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

ipcMain.handle("publish", async (_event, payload?: { target?: PublishTarget }) => {
  if (!latestPreview || !latestSettings) {
    throw new Error("Generate a preview before publishing.");
  }
  latestSettings = readSettingsFromEnv();
  const target = payload?.target ?? "prod";
  const effectiveSettings = applyPublishTarget(latestSettings, target);
  assertPublishSettings(effectiveSettings);
  await logAwsCallerIdentity("publish");
  return publishToS3(
    effectiveSettings,
    latestPreview,
    latestSelection,
    (progress) => {
    sendProgress("publish-progress", {
      ...progress,
      percent: mapPublishProgress(progress),
    });
  },
    sendLog
  );
});

ipcMain.handle("check-prod-state", async (_event, payload?: { target?: PublishTarget }) => {
  const settings = readSettingsFromEnv();
  const target = payload?.target ?? "prod";
  const effectiveSettings = applyPublishTarget(settings, target);
  assertProdSettings(effectiveSettings);
  return checkProdSyncState(effectiveSettings);
});

ipcMain.handle(
  "get-html-diff",
  async (_event, payload: { key: string; target?: PublishTarget }) => {
    const settings = readSettingsFromEnv();
    const target = payload?.target ?? "prod";
    const effectiveSettings = applyPublishTarget(settings, target);
    assertProdSettings(effectiveSettings);
    return getHtmlDiffForKey(effectiveSettings, payload.key);
  }
);
});

ipcMain.handle(
  "download-prod-prefix",
  async (_event, payload?: { target?: PublishTarget }) => {
    const settings = readSettingsFromEnv();
    const target = payload?.target ?? "prod";
    const effectiveSettings = applyPublishTarget(settings, target);
    assertProdSettings(effectiveSettings);
    sendProgress("prod-download-progress", { phase: "start" });
    const result = await downloadPrefixToOut(effectiveSettings, (progress) => {
      sendProgress("prod-download-progress", { phase: "progress", ...progress });
    });
    sendProgress("prod-download-progress", { phase: "done", ...result });
    return result;
  }
);

ipcMain.handle("sync-prod", async (_event, payload?: { target?: PublishTarget }) => {
  const settings = readSettingsFromEnv();
  const target = payload?.target ?? "prod";
  const effectiveSettings = applyPublishTarget(settings, target);
  assertProdSettings(effectiveSettings);
  sendProgress("sync-progress", { phase: "start" });
  const result = await syncProdToOut(effectiveSettings, sendLog, (progress) => {
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
