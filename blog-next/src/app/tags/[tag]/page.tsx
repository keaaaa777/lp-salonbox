import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts, getTagCounts } from "../../../lib/posts";
import { getCategoryInfo } from "../../../lib/categories";
import { withBasePath } from "../../../lib/paths";

export const dynamicParams = false;

export function generateStaticParams() {
  const posts = getAllPosts();
  const tags = getTagCounts(posts).map((tag) => tag.name);
  const params = new Set<string>();
  tags.forEach((tag) => {
    params.add(tag);
    params.add(encodeURIComponent(tag));
  });
  return Array.from(params).map((tag) => ({ tag }));
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const tagName = decodeURIComponent(tag);
  const posts = getAllPosts();
  const filtered = posts.filter((post) => post.tags.includes(tagName));

  if (filtered.length === 0) {
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
              <div className="card-image">Article Image</div>
              <div className="card-content">
                <span className="card-tag">{getCategoryInfo(post.category).label}</span>
                <h3 className="card-title">{post.title}</h3>
                <p className="card-excerpt">{post.excerpt}</p>
                <div className="card-meta">
                  {post.date} | {post.author}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
