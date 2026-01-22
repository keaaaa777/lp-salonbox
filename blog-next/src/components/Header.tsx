import Link from "next/link";
import { withBasePath } from "../lib/paths";

const categoryLinks = [
  { label: "共通", href: "/salonbox/" },
  { label: "ヘア", href: "/salonbox/hair/" },
  { label: "エステ", href: "/salonbox/esthetic/" },
];

export default function Header() {
  return (
    <header>
      <div className="container">
        <div className="header-content">
          <Link className="logo" href={withBasePath("/")}>
            SalonBox Info
          </Link>
          <nav>
            <Link href={withBasePath("/")}>ホーム</Link>
            {categoryLinks.map((item) => (
              <Link key={item.href} href={withBasePath(item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>
          <form className="search-bar" action={withBasePath("/search/")} method="get">
            <input type="text" name="q" placeholder="記事を検索..." />
            <button type="submit">検索</button>
          </form>
        </div>
      </div>
    </header>
  );
}