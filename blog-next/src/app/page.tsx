import Link from "next/link";

export default function RootPage() {
  return (
    <main className="container" style={{ padding: "80px 0" }}>
      <h1 className="card-title">SalonBox Info Blog</h1>
      <p className="card-excerpt" style={{ marginTop: "16px" }}>
        ブログ一覧は以下からアクセスできます。
      </p>
      <div style={{ marginTop: "24px" }}>
        <Link className="tag" href="/blog/">
          /blog/ へ移動
        </Link>
      </div>
    </main>
  );
}
