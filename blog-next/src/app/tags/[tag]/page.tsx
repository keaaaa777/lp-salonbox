import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts, getTagCounts } from "../../../lib/posts";
import { getCategoryInfo } from "../../../lib/categories";
import { withBasePath } from "../../../lib/paths";
import { buildTagSlugMap } from "../../../lib/tag-slugs";

export const dynamicParams = false;

export function generateStaticParams() {
  const posts = getAllPosts();
  const tags = getTagCounts(posts).map((tag) => tag.name);
  const { slugToTag } = buildTagSlugMap(tags);
  return Array.from(slugToTag.keys()).map((tag) => ({ tag }));
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const posts = getAllPosts();
  const { slugToTag } = buildTagSlugMap(posts.flatMap((post) => post.tags));
  const tagName = slugToTag.get(tag) ?? null;
  const filtered = tagName ? posts.filter((post) => post.tags.includes(tagName)) : [];
  const getUpdatedAt = (post: (typeof posts)[number]) => post.updatedAt ?? post.date;

  if (!tagName || filtered.length === 0) {
    notFound();
  }

  return (
    <div className="container">
      <div className="breadcrumb">
        <Link href={withBasePath("/")}>ホーム</Link>
        <span>›</span>
        <span>{tagName}</span>
      </div>

      <section className="main-content">
        <h2 className="card-title">{tagName}の記事</h2>
        <div className="articles-grid" style={{ marginTop: "24px" }}>
          {filtered.map((post) => (
            <Link
              key={post.slug}
              className="article-card"
              href={withBasePath(`/${post.slug}`)}
            >
              {post.hero && (
                <div className="card-image">
                  <img src={post.hero} alt={post.heroAlt ?? post.title} />
                </div>
              )}
              <div className="card-content">
                <span className="card-tag">{getCategoryInfo(post.category).label}</span>
                <h3 className="card-title">{post.title}</h3>
                <p className="card-excerpt">{post.excerpt}</p>
                <div className="card-meta">
                  投稿日: {post.date} / 更新: {getUpdatedAt(post)} | {post.author}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
