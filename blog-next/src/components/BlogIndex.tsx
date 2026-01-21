import Link from "next/link";
import type { PostMeta } from "../lib/posts";
import { CATEGORY_DEFINITIONS, getCategoryInfo } from "../lib/categories";

type CountItem = {
  name: string;
  count: number;
};

type BlogIndexProps = {
  featured: PostMeta[];
  posts: PostMeta[];
  popular: PostMeta[];
  categories: CountItem[];
  tags: CountItem[];
  currentPage: number;
  totalPages: number;
};

export default function BlogIndex({
  featured,
  posts,
  popular,
  categories,
  tags,
  currentPage,
  totalPages,
}: BlogIndexProps) {
  const [featuredMain, ...featuredRest] = featured;

  return (
    <div className="container">
      <section className="hero-section">
        <div className="hero-grid">
          {featuredMain && (
            <Link
              className="featured-card featured-main"
              href={`/blog/${featuredMain.slug}`}
            >
              {featuredMain.hero && (
                <div className="card-image">
                  <img
                    src={featuredMain.hero}
                    alt={featuredMain.heroAlt ?? featuredMain.title}
                  />
                </div>
              )}
              <div className="card-content">
                <span className="card-tag">
                  {getCategoryInfo(featuredMain.category).label}
                </span>
                <h2 className="card-title">{featuredMain.title}</h2>
                <p className="card-excerpt">{featuredMain.excerpt}</p>
                <div className="card-meta">
                  {featuredMain.date} | {featuredMain.author}
                </div>
              </div>
            </Link>
          )}

          {featuredRest.slice(0, 2).map((post) => (
            <Link
              key={post.slug}
              className="featured-card sub-card"
              href={`/blog/${post.slug}`}
            >
              {post.hero && (
                <div className="card-image">
                  <img src={post.hero} alt={post.heroAlt ?? post.title} />
                </div>
              )}
              <div className="card-content">
                <span className="card-tag">
                  {getCategoryInfo(post.category).label}
                </span>
                <h3 className="card-title">{post.title}</h3>
                <div className="card-meta">{post.date}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="main-content">
        <div className="content-grid">
          <div className="articles-grid">
            {posts.map((post) => (
              <Link
                key={post.slug}
                className="article-card"
                href={`/blog/${post.slug}`}
              >
                {post.hero && (
                  <div className="card-image">
                    <img src={post.hero} alt={post.heroAlt ?? post.title} />
                  </div>
                )}
                <div className="card-content">
                  <span className="card-tag">
                    {getCategoryInfo(post.category).label}
                  </span>
                  <h3 className="card-title">{post.title}</h3>
                  <p className="card-excerpt">{post.excerpt}</p>
                  <div className="card-meta">
                    {post.date} | {post.author}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <aside className="sidebar">
            <div className="sidebar-section">
              <h3 className="sidebar-title">人気記事</h3>
              {popular.map((post) => (
                <Link
                  key={post.slug}
                  className="popular-item"
                  href={`/blog/${post.slug}`}
                >
                  <div className="popular-title">{post.title}</div>
                  <div className="popular-meta">{post.date}</div>
                </Link>
              ))}
            </div>

            <div className="sidebar-section">
              <h3 className="sidebar-title">カテゴリ</h3>
              <div className="category-list">
                {CATEGORY_DEFINITIONS.map((category) => {
                  const count =
                    categories.find((item) => item.name === category.key)?.count ??
                    0;
                  return (
                    <Link
                      key={category.key}
                      className="category-item"
                      href={category.path}
                    >
                      <span className="category-name">{category.label}</span>
                      <span className="category-count">{count}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="sidebar-section">
              <h3 className="sidebar-title">タグ</h3>
              <div className="tag-cloud">
                {tags.map((tag) => (
                  <Link
                    key={tag.name}
                    className="tag"
                    href={`/blog/tags/${encodeURIComponent(tag.name)}`}
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            {Array.from({ length: totalPages }, (_, index) => {
              const page = index + 1;
              const href = page === 1 ? "/blog/" : `/blog/page/${page}`;
              return (
                <Link
                  key={page}
                  href={href}
                  className={page === currentPage ? "active" : undefined}
                >
                  {page}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
