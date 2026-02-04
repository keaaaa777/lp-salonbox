import fs from "fs";
import matter from "gray-matter";
import type { Plugin } from "unified";
import type { Root } from "mdast";
import { deriveSlug } from "./slug";
import type { ImageSelection, LoadedPost } from "./types";

const dynamicImport = new Function(
  "modulePath",
  "return import(modulePath)"
) as (modulePath: string) => Promise<unknown>;

export async function loadMarkdownFile(sourcePath: string): Promise<LoadedPost> {
  const markdown = fs.readFileSync(sourcePath, "utf8");
  const { data, content } = matter(markdown);
  const slug = await deriveSlug(sourcePath, data.slug);
  return {
    slug,
    sourcePath,
    markdown,
    data: { ...data },
    content,
  };
}

export async function renderMarkdown(content: string) {
  return renderMarkdownWithPreview(content, {});
}

export function stringifyMarkdown(data: Record<string, unknown>, content: string) {
  return matter.stringify(content, data);
}

type PreviewMeta = {
  slug?: string;
  title?: string;
  category?: string;
  tags: string[];
  hero?: string;
  heroAlt?: string;
  image1?: string;
  image1Alt?: string;
  image2?: string;
  image2Alt?: string;
  image3?: string;
  image3Alt?: string;
  cta1?: string;
  cta2?: string;
};

const PLACEHOLDER_TEXT = "Sample Image";

function normalizePreviewMeta(slug: string, data: Record<string, unknown>): PreviewMeta {
  return {
    slug,
    title: data.title ? String(data.title) : undefined,
    category: data.category ? String(data.category) : "common",
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    hero: data.hero ? String(data.hero) : undefined,
    heroAlt: data.heroAlt ? String(data.heroAlt) : undefined,
    image1: data.image1 ? String(data.image1) : undefined,
    image1Alt: data.image1Alt ? String(data.image1Alt) : undefined,
    image2: data.image2 ? String(data.image2) : undefined,
    image2Alt: data.image2Alt ? String(data.image2Alt) : undefined,
    image3: data.image3 ? String(data.image3) : undefined,
    image3Alt: data.image3Alt ? String(data.image3Alt) : undefined,
    cta1: data.cta1 ? String(data.cta1) : undefined,
    cta2: data.cta2 ? String(data.cta2) : undefined,
  };
}

function createPlaceholderDataUrl(label: string) {
  const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"675\"><rect width=\"100%\" height=\"100%\" fill=\"#1f2a3f\"/><text x=\"50%\" y=\"50%\" dominant-baseline=\"middle\" text-anchor=\"middle\" font-family=\"Arial, sans-serif\" font-size=\"36\" fill=\"#9fb0c7\">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function toFileUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return encodeURI(`file:///${normalized}`);
}

function createImageNode(
  src: string,
  alt?: string,
  localPath?: string
): import("mdast").RootContent {
  const resolved = localPath ? toFileUrl(localPath) : src;
  return {
    type: "image",
    url: resolved,
    alt: alt ?? "",
    data: { hProperties: { className: ["article-image"] } },
  };
}

function createCtaParagraph(
  text: string,
  href: string
): import("mdast").RootContent {
  return {
    type: "paragraph",
    data: { hProperties: { className: ["cta-inline"] } },
    children: [
      {
        type: "link",
        url: href,
        data: { hProperties: { target: "_blank", rel: "noopener noreferrer" } },
        children: [{ type: "text", value: text }],
      },
    ],
  };
}

type CtaLinks = {
  primary: string;
  contact: string;
};

const CTA_LINKS_BY_CATEGORY: Record<string, CtaLinks> = {
  common: {
    primary: "https://mactism-products.com/salonbox/",
    contact: "https://mactism-products.com/salonbox/contact/",
  },
  hair: {
    primary: "https://mactism-products.com/salonbox/hair/",
    contact: "https://mactism-products.com/salonbox/contact/",
  },
  esthetic: {
    primary: "https://mactism-products.com/salonbox/esthetic/",
    contact: "https://mactism-products.com/salonbox/contact/",
  },
};

function getCtaLinks(category?: string): CtaLinks {
  if (!category) return CTA_LINKS_BY_CATEGORY.common;
  return CTA_LINKS_BY_CATEGORY[category] ?? CTA_LINKS_BY_CATEGORY.common;
}

function createCtaBlock(links: CtaLinks): import("mdast").RootContent {
  const ctaItems = [
    {
      text: "無料デモ（3分）：SalonBoxの画面と見える指標を確認",
      url: links.primary,
    },
    {
      text: "CSV1ファイル診断：今のデータで見える化イメージを作成",
      url: links.contact,
    },
    {
      text: "料金・導入フロー：導入前に確認できる資料",
      url: links.primary,
    },
  ];

  const listItems: import("mdast").ListItem[] = ctaItems.map((item) => ({
    type: "listItem",
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "link",
            url: item.url,
            data: { hProperties: { target: "_blank", rel: "noopener noreferrer" } },
            children: [{ type: "text", value: item.text }],
          },
        ],
      },
    ],
  }));

  return {
    type: "blockquote",
    data: { hProperties: { className: ["cta-block"] } },
    children: [
      {
        type: "paragraph",
        data: { hProperties: { className: ["cta-title"] } },
        children: [{ type: "strong", children: [{ type: "text", value: "無料で確認できます" }] }],
      },
      ({
        type: "list",
        ordered: false,
        spread: false,
        data: { hProperties: { className: ["cta-list"] } },
        children: listItems,
      } as import("mdast").List),
    ],
  };
}

const remarkArrowLinks: Plugin<
  [{ visit: typeof import("unist-util-visit").visit }],
  Root
> = (options) => {
  const { visit } = options;
  const pattern = /(?:→|⇒)\s*(\/salonbox(?:\/[a-zA-Z0-9\-_/]*)?\/?)/g;
  return (tree: import("mdast").Root) => {
    if (!tree || !Array.isArray(tree.children)) return;
    return visit(tree, "text", (node: import("mdast").Text, index, parent) => {
      if (!parent || typeof index !== "number") return;
      const value = node.value;
      if (!pattern.test(value)) return;
      pattern.lastIndex = 0;

      const parts: Array<{
        type: "text" | "link";
        value: string;
        className?: string;
      }> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(value)) !== null) {
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          parts.push({ type: "text", value: value.slice(lastIndex, matchIndex) });
        }
        const rawPath = match[1];
        const normalizedPath = rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
        const isSalonboxPath = normalizedPath.startsWith("/salonbox/");
        const linkTarget = isSalonboxPath
          ? "https://mactism-products.com/salonbox/"
          : normalizedPath;
        const linkLabel = isSalonboxPath ? "⇒SalonBox" : `⇒${normalizedPath}`;
        parts.push({
          type: "link",
          value: `${linkTarget}|${linkLabel}`,
          className: isSalonboxPath ? "salonbox-link" : undefined,
        });
        lastIndex = matchIndex + match[0].length;
      }

      if (lastIndex < value.length) {
        parts.push({ type: "text", value: value.slice(lastIndex) });
      }

      const newNodes: import("mdast").PhrasingContent[] = parts.map((part) => {
        if (part.type === "text") {
          return { type: "text", value: part.value };
        }
        const [url, label] = part.value.split("|");
        return {
          type: "link",
          url,
          children: [{ type: "text", value: label }],
          data: part.className
            ? { hProperties: { className: [part.className] } }
            : undefined,
        };
      });

      const typedParent = parent as import("mdast").Parent & {
        children: import("mdast").PhrasingContent[];
      };
      typedParent.children.splice(index, 1, ...newNodes);
      return index + newNodes.length;
    });
  };
};

const remarkCtaAndImages: Plugin<
  [
    {
      meta: PreviewMeta;
      selection: ImageSelection;
      toString: typeof import("mdast-util-to-string").toString;
    },
  ],
  Root
> = (options) => {
  const { meta, selection, toString } = options;
  const ctaLinks = getCtaLinks(meta.category);
  const templateHeadingMatcher = /(テンプレ|チェックリスト)/;

  const placeholderImage = createPlaceholderDataUrl(PLACEHOLDER_TEXT);
  const localImageMap: Partial<Record<keyof ImageSelection, string>> = {};
  (["image1", "image2", "image3"] as const).forEach((slot) => {
    const path = selection[slot];
    if (path) localImageMap[slot] = path;
  });

  return (tree: import("mdast").Root) => {
    if (!tree || !Array.isArray(tree.children)) return;
    const children = tree.children as import("mdast").RootContent[];
    const hasH1 = children.some(
      (node) => node.type === "heading" && (node as import("mdast").Heading).depth === 1
    );
    if (!hasH1 && meta.title) {
      children.unshift({
        type: "heading",
        depth: 1,
        children: [{ type: "text", value: meta.title }],
      } as import("mdast").Heading);
    }

    const cta1Text =
      meta.cta1 ??
      "多店舗の数字を1画面で可視化したい方は、SalonBoxの3分デモをご覧ください。";
    const cta2Text =
      meta.cta2 ??
      "このテンプレを“毎日回る形”にするなら、CSV無料診断で現在のデータで見える化イメージを作れます。";
    const cta1 = createCtaParagraph(cta1Text, ctaLinks.primary);
    const cta2 = createCtaParagraph(cta2Text, ctaLinks.primary);
    const ctaBlock = createCtaBlock(ctaLinks);

    const firstParagraphIndex = children.findIndex(
      (node) => node.type === "paragraph"
    );
    if (firstParagraphIndex >= 0) {
      children.splice(firstParagraphIndex + 1, 0, cta1);
    }

    const safeToString = (node?: import("mdast").Heading) =>
      node ? toString(node) : "";

    const image1Src = meta.image1 ?? placeholderImage;
    const image2Src = meta.image2 ?? placeholderImage;
    const image3Src = meta.image3 ?? placeholderImage;

    const firstH2Index = children.findIndex(
      (node) => node.type === "heading" && (node as import("mdast").Heading).depth === 2
    );
    if (firstH2Index >= 0) {
      children.splice(
        firstH2Index,
        0,
        createImageNode(image1Src, meta.image1Alt ?? PLACEHOLDER_TEXT, localImageMap.image1)
      );
    }

    const templateHeadingIndex = children.findIndex((node) => {
      if (node.type !== "heading") return false;
      const heading = node as import("mdast").Heading;
      return templateHeadingMatcher.test(safeToString(heading));
    });
    if (templateHeadingIndex >= 0) {
      children.splice(
        templateHeadingIndex,
        0,
        createImageNode(image2Src, meta.image2Alt ?? PLACEHOLDER_TEXT, localImageMap.image2)
      );
    }

    const lastH2Index = (() => {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        const node = children[i];
        if (node.type === "heading" && (node as import("mdast").Heading).depth === 2) {
          return i;
        }
      }
      return -1;
    })();
    if (lastH2Index >= 0) {
      children.splice(
        lastH2Index,
        0,
        createImageNode(image3Src, meta.image3Alt ?? PLACEHOLDER_TEXT, localImageMap.image3)
      );
    }

    const templateHeadingIndexForCta = children.findIndex((node) => {
      if (node.type !== "heading") return false;
      const heading = node as import("mdast").Heading;
      return templateHeadingMatcher.test(safeToString(heading));
    });
    if (templateHeadingIndexForCta >= 0) {
      children.splice(templateHeadingIndexForCta + 1, 0, cta2);
    }

    children.push(ctaBlock);
  };
};

export async function renderMarkdownWithPreview(
  content: string,
  data: Record<string, unknown>,
  selection: ImageSelection = {}
) {
  const [
    unifiedModule,
    remarkParseModule,
    remarkGfmModule,
    remarkRehypeModule,
    rehypeSlugModule,
    rehypeStringifyModule,
    visitModule,
    toStringModule,
  ] = await Promise.all([
    dynamicImport("unified") as Promise<typeof import("unified")>,
    dynamicImport("remark-parse") as Promise<typeof import("remark-parse")>,
    dynamicImport("remark-gfm") as Promise<typeof import("remark-gfm")>,
    dynamicImport("remark-rehype") as Promise<typeof import("remark-rehype")>,
    dynamicImport("rehype-slug") as Promise<typeof import("rehype-slug")>,
    dynamicImport("rehype-stringify") as Promise<typeof import("rehype-stringify")>,
    dynamicImport("unist-util-visit") as Promise<typeof import("unist-util-visit")>,
    dynamicImport("mdast-util-to-string") as Promise<typeof import("mdast-util-to-string")>,
  ]);

  const { unified } = unifiedModule;
  const { default: remarkParse } = remarkParseModule;
  const { default: remarkGfm } = remarkGfmModule;
  const { default: remarkRehype } = remarkRehypeModule;
  const { default: rehypeSlug } = rehypeSlugModule;
  const { default: rehypeStringify } = rehypeStringifyModule;
  const visit =
    "visit" in visitModule
      ? visitModule.visit
      : (visitModule as unknown as { default: typeof import("unist-util-visit").visit }).default;
  const toString =
    "toString" in toStringModule
      ? toStringModule.toString
      : (toStringModule as unknown as {
          default: typeof import("mdast-util-to-string").toString;
        }).default;

  const slug = data.slug ? String(data.slug) : "preview";
  const meta = normalizePreviewMeta(slug, data);

  const processed = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkArrowLinks, { visit })
    .use(remarkCtaAndImages, { meta, selection, toString })
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeStringify)
    .process(content);

  const tagHtml =
    meta.tags.length > 0
      ? `<div class=\"article-tags\">${meta.tags
          .map((tag) => `<span class=\"tag\">${tag}</span>`)
          .join("")}</div>`
      : "";

  return `${tagHtml}${processed.toString()}`;
}
