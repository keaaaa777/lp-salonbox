import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";
import type {
  Root,
  Heading,
  Parent,
  RootContent,
  PhrasingContent,
  Text,
  Link,
  ListItem,
  List,
} from "mdast";
import type { Element } from "hast";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { withBasePath } from "./paths";

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  updatedAt?: string;
  author: string;
  category: string;
  tags: string[];
  excerpt: string;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
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
  readingTime?: string;
};

export type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

const postsDirectory = path.join(process.cwd(), "content", "posts");

function normalizeFrontmatter(slug: string, data: Record<string, unknown>): PostMeta {
  return {
    slug,
    title: String(data.title ?? slug),
    date: String(data.date ?? ""),
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
    author: String(data.author ?? "編集部"),
    category: String(data.category ?? "salonbox"),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    excerpt: String(data.excerpt ?? ""),
    metaTitle: data.metaTitle ? String(data.metaTitle) : undefined,
    metaDescription: data.metaDescription ? String(data.metaDescription) : undefined,
    ogImage: data.ogImage ? withBasePath(String(data.ogImage)) : undefined,
    hero: data.hero ? withBasePath(String(data.hero)) : undefined,
    heroAlt: data.heroAlt ? String(data.heroAlt) : undefined,
    image1: data.image1 ? withBasePath(String(data.image1)) : undefined,
    image1Alt: data.image1Alt ? String(data.image1Alt) : undefined,
    image2: data.image2 ? withBasePath(String(data.image2)) : undefined,
    image2Alt: data.image2Alt ? String(data.image2Alt) : undefined,
    image3: data.image3 ? withBasePath(String(data.image3)) : undefined,
    image3Alt: data.image3Alt ? String(data.image3Alt) : undefined,
    cta1: data.cta1 ? String(data.cta1) : undefined,
    cta2: data.cta2 ? String(data.cta2) : undefined,
    readingTime: data.readingTime ? String(data.readingTime) : undefined,
  };
}

export function getPostSlugs(): string[] {
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }
  return fs
    .readdirSync(postsDirectory)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx?$/, ""));
}

export function getAllPosts(): PostMeta[] {
  const slugs = getPostSlugs();
  const posts = slugs.map((slug) => {
    const filePath = path.join(postsDirectory, `${slug}.md`);
    const mdxPath = path.join(postsDirectory, `${slug}.mdx`);
    const sourcePath = fs.existsSync(filePath) ? filePath : mdxPath;
    const fileContents = fs.readFileSync(sourcePath, "utf8");
    const { data } = matter(fileContents);
    return normalizeFrontmatter(slug, data);
  });

  return posts.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  });
}

export function getTagCounts(posts: PostMeta[]) {
  const counts = new Map<string, number>();
  posts.forEach((post) => {
    post.tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function getCategoryCounts(posts: PostMeta[]) {
  const counts = new Map<string, number>();
  posts.forEach((post) => {
    counts.set(post.category, (counts.get(post.category) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function getFeaturedPosts(posts: PostMeta[], count = 3) {
  return posts.slice(0, count);
}

export function getPagedPosts(
  posts: PostMeta[],
  page: number,
  perPage: number,
  excludeSlugs: string[] = []
) {
  const filtered = excludeSlugs.length
    ? posts.filter((post) => !excludeSlugs.includes(post.slug))
    : posts;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const start = (page - 1) * perPage;
  return {
    posts: filtered.slice(start, start + perPage),
    totalPages,
  };
}

function extractToc(markdown: string): TocItem[] {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];

  visit(tree, "heading", (node: Heading) => {
    const depth = node.depth as number;
    if (depth !== 2 && depth !== 3) return;
    const text = toString(node);
    const id = slugger.slug(text);
    items.push({
      id,
      text,
      level: depth as 2 | 3,
    });
  });

  return items;
}

function remarkArrowLinks() {
  const pattern = /(?:→|⇒)\s*(\/salonbox(?:\/[a-zA-Z0-9\-_/]*)?\/?)/g;
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
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
        const internalTarget = normalizedPath.replace(/^\/salonbox/, "/salonbox");
        const linkTarget = isSalonboxPath
          ? "https://mactism-products.com/salonbox/"
          : withBasePath(internalTarget) ?? internalTarget;
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

      const newNodes: PhrasingContent[] = parts.map((part) => {
        if (part.type === "text") {
          const textNode: Text = { type: "text", value: part.value };
          return textNode;
        }
        const [url, label] = part.value.split("|");
        const linkNode: Link = {
          type: "link",
          url,
          children: [{ type: "text", value: label }],
          data: part.className
            ? { hProperties: { className: [part.className] } }
            : undefined,
        };
        return linkNode;
      });

      const typedParent = parent as Parent & { children: PhrasingContent[] };
      typedParent.children.splice(index, 1, ...newNodes);
      return index + newNodes.length;
    });
  };
}

function remarkCtaAndImages(options: { meta: PostMeta }) {
  const { meta } = options;
  const ctaLinks = getCtaLinks(meta.category);
  const templateHeadingMatcher = /(テンプレ|チェックリスト)/;

  return (tree: Root) => {
    const children = tree.children as RootContent[];
    const hasH1 = children.some(
      (node) => node.type === "heading" && (node as Heading).depth === 1
    );
    if (!hasH1) {
      children.unshift({
        type: "heading",
        depth: 1,
        children: [{ type: "text", value: meta.title }],
      } as Heading);
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

    if (meta.image1) {
      const firstH2Index = children.findIndex(
        (node) => node.type === "heading" && (node as Heading).depth === 2
      );
      if (firstH2Index >= 0) {
        children.splice(
          firstH2Index,
          0,
          createImageNode(meta.image1, meta.image1Alt)
        );
      }
    }

    if (meta.image2) {
      const templateHeadingIndex = children.findIndex((node) => {
        if (node.type !== "heading") return false;
        const heading = node as Heading;
        return templateHeadingMatcher.test(toString(heading));
      });
      if (templateHeadingIndex >= 0) {
        children.splice(
          templateHeadingIndex,
          0,
          createImageNode(meta.image2, meta.image2Alt)
        );
      }
    }

    if (meta.image3) {
      const lastH2Index = (() => {
        for (let i = children.length - 1; i >= 0; i -= 1) {
          const node = children[i];
          if (node.type === "heading" && (node as Heading).depth === 2) {
            return i;
          }
        }
        return -1;
      })();
      if (lastH2Index >= 0) {
        children.splice(
          lastH2Index,
          0,
          createImageNode(meta.image3, meta.image3Alt)
        );
      }
    }

    const templateHeadingIndexForCta = children.findIndex((node) => {
      if (node.type !== "heading") return false;
      const heading = node as Heading;
      return templateHeadingMatcher.test(toString(heading));
    });
    if (templateHeadingIndexForCta >= 0) {
      children.splice(templateHeadingIndexForCta + 1, 0, cta2);
    }

    children.push(ctaBlock);
  };
}

function createImageNode(src: string, alt?: string): RootContent {
  return {
    type: "image",
    url: withBasePath(src) ?? src,
    alt: alt ?? "",
    data: { hProperties: { className: ["article-image"] } },
  };
}

function rehypeBasePath() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const props = node.properties;
      if (!props) return;
      if (node.tagName === "img" && typeof props.src === "string") {
        const updated = withBasePath(props.src);
        if (updated) props.src = updated;
      }
      if (node.tagName === "a" && typeof props.href === "string") {
        const updated = withBasePath(props.href);
        if (updated) props.href = updated;
      }
    });
  };
}

function createCtaParagraph(text: string, href: string): RootContent {
  return {
    type: "paragraph",
    data: { hProperties: { className: ["cta-inline"] } },
    children: [
      {
        type: "link",
        url: href,
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
  salonbox: {
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

function getCtaLinks(category: string): CtaLinks {
  return CTA_LINKS_BY_CATEGORY[category] ?? CTA_LINKS_BY_CATEGORY.salonbox;
}

function createCtaBlock(links: CtaLinks): RootContent {
  const ctaItems = [
    {
      text: "無料デモ（3分）：SalonBoxの画面と見える指標を確認",
      url: links.primary,
    },
    {
      text: "CSV1ファイル無料診断：いまのデータで“見える化サンプル”を作成",
      url: links.contact,
    },
    {
      text: "料金・機能資料：導入判断に必要な情報だけ先に確認",
      url: links.primary,
    },
  ];

  const listItems: ListItem[] = ctaItems.map((item) => ({
    type: "listItem",
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "link",
            url: item.url,
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
        children: [{ type: "strong", children: [{ type: "text", value: "無料で確認する" }] }],
      },
      ({
        type: "list",
        ordered: false,
        spread: false,
        data: { hProperties: { className: ["cta-list"] } },
        children: listItems,
      } as List),
    ],
  };
}

export async function getPostBySlug(slug: string) {
  if (!slug) {
    throw new Error("Post slug is required.");
  }
  const filePath = path.join(postsDirectory, `${slug}.md`);
  const mdxPath = path.join(postsDirectory, `${slug}.mdx`);
  const sourcePath = fs.existsSync(filePath) ? filePath : mdxPath;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Post file not found for slug: ${slug}`);
  }
  const fileContents = fs.readFileSync(sourcePath, "utf8");
  const { data, content } = matter(fileContents);
  const meta = normalizeFrontmatter(slug, data);

  const toc = extractToc(content);
  const processed = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkArrowLinks)
    .use(remarkCtaAndImages, { meta })
    .use(remarkRehype)
    .use(rehypeBasePath)
    .use(rehypeSlug)
    .use(rehypeStringify)
    .process(content);

  return {
    meta,
    content,
    html: processed.toString(),
    toc,
  };
}
