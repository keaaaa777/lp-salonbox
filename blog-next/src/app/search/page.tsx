import Link from "next/link";
import { Suspense } from "react";
import SearchResults from "../../components/SearchResults";
import { getAllPosts } from "../../lib/posts";
import { withBasePath } from "../../lib/paths";

export default function SearchPage() {
  const posts = getAllPosts();
  return (
    <div className="container">
      <div className="breadcrumb">
        <Link href={withBasePath("/")}>ホーム</Link>
        <span>›</span>
        <span>検索</span>
      </div>
      <Suspense fallback={<p style={{ marginTop: "24px" }}>検索中...</p>}>
        <SearchResults posts={posts} />
      </Suspense>
    </div>
  );
}
