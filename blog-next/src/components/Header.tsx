import Link from "next/link";

const categoryLinks = [
  { label: "共通", href: "/blog/salonbox/" },
  { label: "ヘア", href: "/blog/salonbox/hair/" },
  { label: "エステ", href: "/blog/salonbox/esthetic/" },
];

export default function Header() {
  return (
    <header>
      <div className="container">
        <div className="header-content">
          <Link className="logo" href="/blog/">
            SalonBox Info
          </Link>
          <nav>
            <Link href="/blog/">ホーム</Link>
            {categoryLinks.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <form className="search-bar" action="/blog/search/" method="get">
            <input type="text" name="q" placeholder="記事を検索..." />
            <button type="submit">検索</button>
          </form>
        </div>
      </div>
    </header>
  );
}
