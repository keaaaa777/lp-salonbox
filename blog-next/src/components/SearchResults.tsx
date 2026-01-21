"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { PostMeta } from "../lib/posts";
import { getCategoryInfo } from "../lib/categories";

type SearchResultsProps = {
  posts: PostMeta[];
};

export default function SearchResults({ posts }: SearchResultsProps) {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();

  const results = useMemo(() => {
    if (!query) return [];
    const needle = query.toLowerCase();
    return posts.filter((post) => {
      const haystack = [
        post.title,
        post.excerpt,
        post.author,
        post.category,
        ...(post.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [posts, query]);

  return (
    <section className="main-content">
      <h2 className="card-title">検索結果</h2>
      <p className="card-meta" style={{ marginTop: "8px" }}>
        キーワード: {query || "未入力"}
      </p>
      {query && results.length === 0 && (
        <p style={{ marginTop: "24px", color: "var(--moss)" }}>
          該当する記事が見つかりませんでした。
        </p>
      )}
      <div className="articles-grid" style={{ marginTop: "24px" }}>
        {results.map((post) => (
          <Link
            key={post.slug}
            className="article-card"
            href={`/blog/${post.slug}`}
          >
            <div className="card-image">Article Image</div>
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
    </section>
  );
}
