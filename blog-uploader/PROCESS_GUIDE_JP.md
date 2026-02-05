# 記事Builder / Uploader 処理フロー（初心者向け）

このドキュメントは「記事を作る → プレビュー → ビルド → S3へ投稿」の流れを、手順と内部処理の順でまとめたものです。

---

## 0. 全体像（ざっくり）

1) **記事ファイル（Markdown）と画像を用意**  
2) **Uploaderでプレビュー生成**  
3) **必要ならローカルビルド（blog-next）**  
4) **S3へアップロード（本番/テスト）**  
5) **CloudFrontのキャッシュ無効化**

---

## 1. 事前準備（ファイル）

### 1-1) Markdown（記事）
- 場所: `blog-next/content/posts/`
- ファイル名がURLスラッグになる
- frontmatter に `title / date / category / tags / cta1 / cta2` などを設定

### 1-2) 画像
- 場所: `blog-next/public/images/posts/<slug>/`
- 想定ファイル名:
  - `hero.webp`
  - `figure-01.webp`
  - `figure-02.webp`
  - `figure-03.webp`

---

## 2. Uploader（プレビュー）

### 2-1) プレビューで行われること
1) Markdown を読み込み
2) 画像を割り当て（hero / image1 / image2 / image3）
3) 本文に **CTA・画像を自動挿入**
4) HTMLとしてプレビュー表示

### 2-2) プレビューは「ローカルだけ」
- S3にはまだ何もアップしません
- 表示確認用です

---

## 3. Uploader（投稿）

### 3-1) 投稿ボタンで行われること
1) **設定の読み込み（.env）**  
   - 本番/テストを切替  
   - `PUBLISHER_PROD_*` or `PUBLISHER_STG_*`
2) **ローカルビルド（blog-next）**  
   - `npm run build` 相当
3) **out/ をS3へアップロード**
4) **CloudFront 無効化**

---

## 4. blog-next のビルド内容

`npm run build` で次が実行されます。

1) `next build`
   - Markdown (`content/posts`) を読み込み
   - frontmatter を解析し、メタ情報を作成
   - 本文に **CTA / 画像** を自動挿入
   - 各ページのHTMLを `out/` に静的出力
   - 例:
     - 記事詳細: `out/<slug>/index.html`
     - 一覧: `out/index.html`
     - カテゴリ: `out/common/`, `out/hair/`, `out/esthetic/`
     - 検索: `out/search/`
     - タグ: `out/tags/<slug>/`

2) `postbuild`（後処理）:
   - `scripts/generate-sitemap.js`
     - `out/sitemap.xml` を生成
     - `NEXT_PUBLIC_BASE_PATH` を考慮したURLで出力
   - `scripts/normalize-tag-paths.js`
     - タグのフォルダ名を正規化
     - （例）URLエンコード名 → 表示名へのコピーなど
   - `scripts/copy-md-sources.js`
     - MD原本を `out/md-sources/` に保存
     - 「ビルド時に使った原稿の保存」が目的

生成物は `blog-next/out/` に出力されます。

---

## 5. S3へ上がるもの

Uploaderは **out/ 配下を再帰的に全部アップロード**します。

例:
- `out/index.html`
- `out/20260203-xxx/index.html`
- `out/tags/...`
- `out/_next/...`
- `out/md-sources/...` ← 記事原稿の原本

---

## 6. 本番/テスト切替

UploaderのPreviewタブ右上で切替します。

### 本番
- `PUBLISHER_PROD_BUCKET`
- `PUBLISHER_PROD_PREFIX`
- `PUBLISHER_PROD_CLOUDFRONT_DISTRIBUTION_ID`

### テスト
- `PUBLISHER_STG_BUCKET`
- `PUBLISHER_STG_PREFIX`
- `PUBLISHER_STG_CLOUDFRONT_DISTRIBUTION_ID`

---

## 7. よくある確認ポイント

- 画像が表示されない  
  → `public/images/posts/<slug>/` にあるか、パスが正しいか

- タグやURLが変  
  → ビルド後の `out/tags/` を確認

- 反映されない  
  → S3への再アップロードと CloudFront 無効化を確認

---

## 8. 最短の運用フロー（実務向け）

1) Markdown/画像を用意  
2) Uploaderでフォルダ選択 → プレビュー  
3) 問題なければ投稿  
4) 本番/テストを間違えない

---

必要なら、このドキュメントを **DEPLOY_GUIDE_JP.md に統合**する形にもできます。  
