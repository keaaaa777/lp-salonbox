import Link from "next/link";
import { withBasePath } from "../lib/paths";

export default function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>SalonBox Infoについて</h3>
            <p>
              サロン経営者とスタイリストのための総合情報メディア。最新のトレンド、
              技術、経営ノウハウを発信しています。
            </p>
          </div>
          <div className="footer-section">
            <h3>カテゴリ</h3>
            <div className="footer-links">
              <Link href={withBasePath("/common/")}>共通</Link>
              <Link href={withBasePath("/hair/")}>ヘア</Link>
              <Link href={withBasePath("/esthetic/")}>エステ</Link>
            </div>
          </div>
          <div className="footer-section">
            <h3>サービス</h3>
            <div className="footer-links">
              <a href="https://recruit-mactism.com/" target="_blank" rel="noopener">採用募集</a>
              <a href="https://mactism-products.com/salonbox/contact/" target="_blank" rel="noopener">お問い合わせ</a>
            </div>
          </div>
          <div className="footer-section">
            <h3>運営会社</h3>
            <div className="footer-links">
              <a href="https://www.mactism.com/" target="_blank" rel="noopener">株式会社マクティズム
              <br></br>大阪府大阪市中央区大手通1丁目3-4
              <br></br>ツムラ大手通ビル201</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">© 2025 SalonBox Info. All rights reserved.</div>
      </div>
    </footer>
  );
}
