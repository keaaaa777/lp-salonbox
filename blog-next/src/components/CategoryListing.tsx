import Link from "next/link";
import type { PostMeta } from "../lib/posts";
import { getCategoryInfo } from "../lib/categories";
import { withBasePath } from "../lib/paths";

type CategoryListingProps = {
  label: string;
  path: string;
  posts: PostMeta[];
};

export default function CategoryListing({
  label,
  path,
  posts,
}: CategoryListingProps) {
  const getUpdatedAt = (post: PostMeta) => post.updatedAt ?? post.date;

  return (
    <div className="container">
      <div className="breadcrumb">
        <Link href={withBasePath("/")}>ホーム</Link>
        <span>›</span>
        <Link href={withBasePath("/salonbox/")}>SalonBox</Link>
        <span>›</span>
        <Link href={withBasePath(path)}>{label}</Link>
      </div>

      <section className="main-content">
        <h2 className="card-title">{label}の記事</h2>
        <div className="articles-grid" style={{ marginTop: "24px" }}>
          {posts.map((post) => (
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
        {posts.length === 0 && (
          <p style={{ marginTop: "24px", color: "var(--moss)" }}>
            まだ記事がありません。
          </p>
        )}
      </section>
    </div>
  );
}
