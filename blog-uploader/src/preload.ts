import { contextBridge, ipcRenderer } from "electron";
import type { ImageSelection, PreviewResult, PublishResult } from "./lib/types";

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
};

contextBridge.exposeInMainWorld("publisherApi", api);

declare global {
  interface Window {
    publisherApi: typeof api;
  }
}
