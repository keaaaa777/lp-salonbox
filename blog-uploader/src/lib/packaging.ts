import path from "path";
import { loadMarkdownFile, renderMarkdownWithPreview, stringifyMarkdown } from "./markdown";
import type {
  ImageSelection,
  ImageSlot,
  PreviewResult,
  PublisherSettings,
} from "./types";

const slotFileBase: Record<ImageSlot, string> = {
  hero: "hero",
  image1: "figure-01",
  image2: "figure-02",
  image3: "figure-03",
};

function normalizePrefix(prefix: string) {
  return prefix.replace(/^\/+/, "").replace(/\/+$/, "");
}

function slotToKey(settings: PublisherSettings, slug: string, slot: ImageSlot, sourcePath: string) {
  const imagesPrefix = normalizePrefix(settings.imagesPrefix);
  const ext = path.extname(sourcePath).toLowerCase() || ".webp";
  const baseName = slotFileBase[slot];
  return `${imagesPrefix}/posts/${slug}/${baseName}${ext}`;
}

function applyImageFrontmatter(
  data: Record<string, unknown>,
  slug: string,
  selection: ImageSelection,
  settings: PublisherSettings
) {
  const imageKeys: Record<ImageSlot, string | undefined> = {
    hero: undefined,
    image1: undefined,
    image2: undefined,
    image3: undefined,
  };

  (Object.keys(selection) as ImageSlot[]).forEach((slot) => {
    const sourcePath = selection[slot];
    if (!sourcePath) return;
    const key = slotToKey(settings, slug, slot, sourcePath);
    imageKeys[slot] = key;

    const publicPath = `/${key}`;
    if (slot === "hero") {
      data.ogImage = publicPath;
      data.hero = publicPath;
    } else {
      data[slot] = publicPath;
    }
  });

  return imageKeys;
}

export async function preparePreview(
  markdownPath: string,
  selection: ImageSelection,
  settings: PublisherSettings
): Promise<PreviewResult> {
  const post = await loadMarkdownFile(markdownPath);
  const data: Record<string, unknown> = { ...post.data, slug: post.slug };
  const imageKeys = applyImageFrontmatter(data, post.slug, selection, settings);

  const html = await renderMarkdownWithPreview(post.content, data, selection);
  const markdownWithFrontmatter = stringifyMarkdown(data, post.content);

  return {
    slug: post.slug,
    title: String(data.title ?? post.slug),
    html,
    markdownWithFrontmatter,
    imageKeys,
  };
}

export function buildPostKey(settings: PublisherSettings, slug: string) {
  const postsPrefix = normalizePrefix(settings.postsPrefix);
  return `${postsPrefix}/${slug}.md`;
}

export function buildImageKey(
  settings: PublisherSettings,
  slug: string,
  slot: ImageSlot,
  sourcePath: string
) {
  return slotToKey(settings, slug, slot, sourcePath);
}
