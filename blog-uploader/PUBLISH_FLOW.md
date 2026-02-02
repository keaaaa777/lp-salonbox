# Uploader（blog-uploader）: プレビュー〜投稿の詳細フロー

この文書は、現在の `blog-uploader` 実装（`blog-uploader/src/*`）を根拠に、
プレビュー生成から投稿（S3/CodeBuild/CloudFront 反映）までの流れを
**条件別に**整理したものです。

## 1. 全体像（大きな流れ）

1) **UIで入力**  
   - Markdownファイルを選択  
   - 画像（hero / image1 / image2 / image3）を選択

2) **プレビュー生成（ローカル）**  
   - Markdownを読み込み → frontmatter を整理 → HTML に変換  
   - 画像の挿入位置やCTAブロックを追加  
   - **この時点ではアップロードは行われない**

3) **投稿（publish）**  
   - **Source バケット**に Markdown + 画像を `PutObject`  
   - （条件次第で）**ローカルビルド** → **Prod バケットへ `out/` を `PutObject`**  
   - （条件次第で）**CloudFront invalidation**  
   - （条件次第で）**CodeBuild起動**

## 2. 前提となる環境変数（.env）

主に使われるもの（抜粋）:

- `PUBLISHER_AWS_REGION`（必須）
- `PUBLISHER_SOURCE_BUCKET`（Sourceアップロードに必須）
- `PUBLISHER_POSTS_PREFIX`（既定: `posts`）
- `PUBLISHER_IMAGES_PREFIX`（既定: `images`）
- `PUBLISHER_LOCAL_BUILD`（`1` でローカルビルドを実行）
- `PUBLISHER_BLOG_NEXT_DIR`（既定: `../blog-next`）
- `PUBLISHER_PROD_BUCKET`（ローカルビルド時のProdアップロード先）
- `PUBLISHER_PROD_PREFIX`（例: `blog`）
- `PUBLISHER_CLOUDFRONT_DISTRIBUTION_ID`（あれば invalidation）
- `PUBLISHER_CODEBUILD_PROJECT`（ローカルビルドしない場合に起動）

AWS認証は通常のAWS SDKのチェーンを使うため、  
`AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY` を `.env` に入れておく必要があります。

## 3. プレビュー生成の詳細

### 3.1 Markdown読み込みとslug決定

- ファイルを読み込み、frontmatter（YAML）と本文を分離  
- `slug` は `frontmatter.slug` があればそれを優先し、なければファイル名から生成

### 3.2 画像スロット → frontmatter への反映

選択した画像を `imagesPrefix/posts/<slug>/...` に変換して frontmatter に入れる:

- hero  -> `images/posts/<slug>/hero.<ext>`  
  - `hero` と `ogImage` に反映  
- image1 -> `images/posts/<slug>/figure-01.<ext>`  
- image2 -> `images/posts/<slug>/figure-02.<ext>`  
- image3 -> `images/posts/<slug>/figure-03.<ext>`

### 3.3 HTML化とレイアウト補助

プレビュー生成時に以下の補助が自動挿入されます:

- CTAリンクの自動挿入
- 画像の自動挿入位置（h2の前後）
- 未指定画像はプレースホルダー表示
- `/salonbox/...` 風のリンク表記を自動置換

## 4. 投稿時のアップロード内容（Source）

投稿時は **Sourceバケット**に `PutObject` します。

### 4.1 投稿Markdown

```
{PUBLISHER_POSTS_PREFIX}/{slug}.md
```

中身は **frontmatter更新済みのMarkdown** が丸ごと入ります。

### 4.2 画像

選択された画像のみ `PutObject`：

```
{PUBLISHER_IMAGES_PREFIX}/posts/{slug}/hero.<ext>
{PUBLISHER_IMAGES_PREFIX}/posts/{slug}/figure-01.<ext>
{PUBLISHER_IMAGES_PREFIX}/posts/{slug}/figure-02.<ext>
{PUBLISHER_IMAGES_PREFIX}/posts/{slug}/figure-03.<ext>
```

### 4.3 Content-Type

アップロード時に拡張子に応じた Content-Type を付与します  
（例: `.html` → `text/html`, `.png` → `image/png` など）。

## 5. 投稿後の分岐（条件別）

### A. `PUBLISHER_LOCAL_BUILD=1` の場合

1) `blog-next` の以下にローカルで書き込み  
   - `content/posts/{slug}.md`  
   - `public/images/posts/{slug}/*`
2) `blog-next` を `npm run build`  
3) `blog-next/out` の全ファイルを Prod バケットへ `PutObject`  
4) `PUBLISHER_CLOUDFRONT_DISTRIBUTION_ID` があれば invalidation

**結果**  
→ **即時でプロダクション静的サイトが更新される**

### B. `PUBLISHER_LOCAL_BUILD=1` ではない + CodeBuild指定あり

1) Sourceバケットへアップロード  
2) CodeBuildを起動  
   - `BLOG_SLUG` 等の環境変数を渡す

**結果**  
→ **ビルド/デプロイは CodeBuild 側のパイプライン任せ**

### C. `PUBLISHER_LOCAL_BUILD=1` ではない + CodeBuild指定なし

1) Sourceバケットへアップロードのみ

**結果**  
→ **Sourceは更新されるが、サイト公開は更新されない**

## 6. 更新・削除の挙動（重要）

### 更新

- 同じ `slug` なら **同じS3キーに `PutObject`**  
  → **上書き更新**されます
- `slug` が変わると **新しいキーに投稿**  
  → 旧slugのデータは残ります

### 削除

- **削除処理は存在しません**
- 画像を選択しなかった場合も **既存画像は削除されません**
- 記事削除が必要な場合は **手動でS3から削除**が必要です

## 7. 反映ルートまとめ（簡易マップ）

```
UI入力
 └─ generate-preview
     └─ Markdown + 画像選択 → HTMLプレビュー生成（ローカル）

publish
 ├─ Source S3: posts/{slug}.md
 ├─ Source S3: images/posts/{slug}/*
 ├─ [PUBLISHER_LOCAL_BUILD=1]
 │    ├─ blog-next/content/posts/{slug}.md
 │    ├─ blog-next/public/images/posts/{slug}/*
 │    ├─ blog-next/out/*
 │    └─ Prod S3: {PUBLISHER_PROD_PREFIX}/...
 │         └─ CloudFront invalidation
 └─ [Local buildなし]
      └─ CodeBuild起動（設定があれば）
```

## 8. よくある誤解ポイント

- **「プレビュー生成＝公開」ではない**
- **Sourceバケット更新だけではサイトは変わらない**  
  → CodeBuild or ローカルビルドが必要
- **削除は自動では行われない**

---

必要なら、この文書に **「S3/CodeBuild/CloudFrontの実際のAWS設定例」** や  
**「削除フローの推奨手順」** も追記できます。  
追記したい内容があれば教えてください。  
