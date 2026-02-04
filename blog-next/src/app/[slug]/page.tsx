import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllPosts,
  getPostBySlug,
  getPostSlugs,
  type TocItem,
} from "../../lib/posts";
import { getCategoryInfo } from "../../lib/categories";
import { withBasePath } from "../../lib/paths";
import { buildTagSlugMap } from "../../lib/tag-slugs";
import ShareActions from "../../components/ShareActions";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!slug) {
    return {
      title: "SalonBox",
    };
  }
  const post = await getPostBySlug(slug);
  const metaTitle = post.meta.metaTitle ?? post.meta.title;
  const metaDescription = post.meta.metaDescription ?? post.meta.excerpt;
  const ogImage = post.meta.ogImage ?? post.meta.hero;

  return {
    title: `${metaTitle} | SalonBox`,
    description: metaDescription,
    openGraph: {
      title: `${metaTitle} | SalonBox`,
      description: metaDescription,
      images: ogImage ? [ogImage] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: `${metaTitle} | SalonBox`,
      description: metaDescription,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

function renderToc(items: TocItem[]) {
  return items.map((item) => (
    <li key={item.id}>
      <a href={`#${item.id}`} className={item.level === 2 ? "toc-h2" : "toc-h3"}>
        {item.text}
      </a>
    </li>
  ));
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const slugs = getPostSlugs();
  if (!slugs.includes(slug)) {
    notFound();
  }

  const { meta, html, toc, content } = await getPostBySlug(slug);
  const allPosts = getAllPosts();
  const related = allPosts
    .filter((post) => post.slug !== slug && post.category === meta.category)
    .slice(0, 4);
  const { tagToSlug } = buildTagSlugMap(allPosts.flatMap((post) => post.tags));

  const readingTime =
    meta.readingTime ?? `約${Math.max(1, Math.round(content.length / 600))}分`;
  const categoryInfo = getCategoryInfo(meta.category);
  const heroAlt = meta.heroAlt ?? meta.title;
  const shareUrl = `https://mactism-products.com${withBasePath(`/${slug}`)}`;
  const updatedAt = meta.updatedAt ?? meta.date;

  return (
    <div className="container">
      <div className="breadcrumb">
        <Link href={withBasePath("/")}>ホーム</Link>
        <span>›</span>
        <Link href={withBasePath("/common/")}>SalonBox</Link>
        <span>›</span>
        <Link href={withBasePath(categoryInfo.path)}>{categoryInfo.label}</Link>
        <span>›</span>
        <span>{meta.title}</span>
      </div>

      <div className="article-layout">
        <article className="article-main">
          <div className="article-header">
            <span className="article-tag">{categoryInfo.label}</span>
            <h1 className="article-title">{meta.title}</h1>
            <div className="article-meta">
              <div className="meta-item">投稿日: {meta.date}</div>
              <div className="meta-item">最終更新日: {updatedAt}</div>
              <div className="meta-item">{meta.author}</div>
              <div className="meta-item">読了時間：{readingTime}</div>
            </div>
          </div>

          {meta.hero && (
            <div className="article-hero-image">
              <img src={meta.hero} alt={heroAlt} />
            </div>
          )}

          <div className="article-body" dangerouslySetInnerHTML={{ __html: html }} />

          <div className="article-footer">
            <div className="article-tags">
              {meta.tags.map((tag) => (
                <Link
                  key={tag}
                  className="tag"
                  href={withBasePath(`/search/?q=${encodeURIComponent(tag)}`)}
                >
                  {tag}
                </Link>
              ))}
            </div>

            <div className="share-section">
              <div className="share-title">この記事をシェア</div>
              <ShareActions url={shareUrl} title={meta.title} />
            </div>
          </div>
        </article>

        <aside className="article-sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-title">著者について</h3>
            <div className="author-info">
              <div className="author-avatar">
                <img src={withBasePath("/アイコン.webp")} alt="編集部" />
              </div>
              <div className="author-name">{meta.author}</div>
              <div className="author-role">SalonBox 編集チーム</div>
              <p className="author-bio">
                サロン業界の最新トレンドと実践ノウハウを発信。経営者・
                スタイリストの成功をサポートします。
              </p>
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">目次</h3>
            <ul className="toc">{renderToc(toc)}</ul>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">関連記事</h3>
            {related.map((post) => (
              <Link
                key={post.slug}
                className="related-item"
                href={withBasePath(`/${post.slug}`)}
              >
                <div className="related-title">{post.title}</div>
                <div className="related-meta">
                  投稿日: {post.date} / 更新: {post.updatedAt ?? post.date}
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
