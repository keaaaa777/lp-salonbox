import Link from "next/link";

export default function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>SalonBox Info について</h3>
            <p>
              サロン経営者とスタイリストのための総合情報メディア。最新のトレンド、
              技術、経営ノウハウを発信しています。
            </p>
          </div>
          <div className="footer-section">
            <h3>カテゴリ</h3>
            <div className="footer-links">
              <Link href="/blog/salonbox/">共通</Link>
              <Link href="/blog/salonbox/hair/">ヘア</Link>
              <Link href="/blog/salonbox/esthetic/">エステ</Link>
            </div>
          </div>
          <div className="footer-section">
            <h3>サービス</h3>
            <div className="footer-links">
              <a href="#">広告掲載</a>
              <a href="#">取材依頼</a>
              <a href="#">寄稿者募集</a>
              <a href="#">お問い合わせ</a>
            </div>
          </div>
          <div className="footer-section">
            <h3>運営会社</h3>
            <div className="footer-links">
              <a href="#">株式会社マクティズム </a>
              <a href="#">大阪府大阪市中央区大手通2丁目3−14</a>
              <a href="#">ツムラ大手通ビル201</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">© 2025 SalonBox Info. All rights reserved.</div>
      </div>
    </footer>
  );
}
