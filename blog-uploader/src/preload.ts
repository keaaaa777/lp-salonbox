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

const api = {
  selectMarkdown: () => ipcRenderer.invoke("select-markdown") as Promise<string | null>,
  selectImage: () => ipcRenderer.invoke("select-image") as Promise<string | null>,
  generatePreview: (payload: PreviewPayload) =>
    ipcRenderer.invoke("generate-preview", payload) as Promise<PreviewResult>,
  publish: () => ipcRenderer.invoke("publish") as Promise<PublishResult>,
  checkProdState: () => ipcRenderer.invoke("check-prod-state") as Promise<S3DiffSummary>,
  getHtmlDiff: (key: string) =>
    ipcRenderer.invoke("get-html-diff", { key }) as Promise<string>,
  downloadProdPrefix: () =>
    ipcRenderer.invoke("download-prod-prefix") as Promise<PrefixDownloadResult>,
  syncProd: () => ipcRenderer.invoke("sync-prod") as Promise<{ deleted: number; uploaded: boolean }>,
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
