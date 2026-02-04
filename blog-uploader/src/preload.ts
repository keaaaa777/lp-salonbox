import { contextBridge, ipcRenderer } from "electron";
import type {
  ImageSelection,
  OutArticle,
  PrefixDownloadResult,
  PreviewResult,
  PublishResult,
  S3DiffSummary,
  DeleteArticleResult,
} from "./lib/types";

type PreviewPayload = {
  markdownPath: string;
  selection: ImageSelection;
};

type PublishTarget = "prod" | "stg";

const api = {
  selectMarkdown: () => ipcRenderer.invoke("select-markdown") as Promise<string | null>,
  selectImage: () => ipcRenderer.invoke("select-image") as Promise<string | null>,
  selectFolder: () => ipcRenderer.invoke("select-folder") as Promise<{
    markdownPath: string | null;
    images: Partial<Record<ImageSlot, string>>;
  }>,
  generatePreview: (payload: PreviewPayload) =>
    ipcRenderer.invoke("generate-preview", payload) as Promise<PreviewResult>,
  publish: (target: PublishTarget) =>
    ipcRenderer.invoke("publish", { target }) as Promise<PublishResult>,
  checkProdState: (target: PublishTarget) =>
    ipcRenderer.invoke("check-prod-state", { target }) as Promise<S3DiffSummary>,
  getHtmlDiff: (key: string, target: PublishTarget) =>
    ipcRenderer.invoke("get-html-diff", { key, target }) as Promise<string>,
  downloadProdPrefix: (target: PublishTarget) =>
    ipcRenderer.invoke("download-prod-prefix", { target }) as Promise<PrefixDownloadResult>,
  syncProd: (target: PublishTarget) =>
    ipcRenderer.invoke("sync-prod", { target }) as Promise<{ deleted: number; uploaded: boolean }>,
  listOutArticles: () => ipcRenderer.invoke("list-out-articles") as Promise<OutArticle[]>,
  deleteOutArticle: (slug: string) =>
    ipcRenderer.invoke("delete-out-article", { slug }) as Promise<DeleteArticleResult>,
  onProgress: (handler: (payload: any) => void) => ipcRenderer.on("prod-download-progress", (_e, payload) => handler(payload)),
  onPublishProgress: (handler: (payload: any) => void) =>
    ipcRenderer.on("publish-progress", (_e, payload) => handler(payload)),
  onSyncProgress: (handler: (payload: any) => void) =>
    ipcRenderer.on("sync-progress", (_e, payload) => handler(payload)),
  onProdLog: (handler: (payload: { message: string }) => void) =>
    ipcRenderer.on("prod-log", (_e, payload) => handler(payload)),
};

contextBridge.exposeInMainWorld("publisherApi", api);

declare global {
  interface Window {
    publisherApi: typeof api;
  }
}
