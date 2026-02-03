# SalonBox Blog - S3アップロード手順（初心者向け）

この資料は、`blog-next/` のブログを **S3 + CloudFront** へドラッグ&ドロップで公開するための手順です。  
記事作成からデプロイまでを **初回** と **日々（更新時）** に分けて説明します。

---

## 1. 使うフォルダと役割

- 記事を書く場所: `blog-next/content/posts/`
- 画像を置く場所: `blog-next/public/images/posts/`
- ビルド結果（アップロード対象）: `blog-next/out/`
- ビルド時にMD原本を保存: `blog-next/out/md-sources/`

**重要**: S3へアップロードするのは `out/` フォルダの **中身全部** です。

---

## 1.5 画像の置き方（記事ごとのおすすめ構成）

記事ごとにフォルダを分けると管理が楽です。

```
blog-next/
  content/
    posts/
      20260120-example-article.md
  public/
    images/
      posts/
        20260120-example-article/
          hero.webp
          figure-01.webp
          figure-02.webp
          figure-03.webp
```

Markdown内の指定例:
```md
![ヒーロー画像](/images/posts/20260120-example-article/hero.webp)
```

ポイント:
- `content/posts/` のファイル名と、`public/images/posts/` のフォルダ名を揃える
- 画像パスは必ず `/images/...` の **絶対パス** で記載する

---

## 2. カテゴリ別に記事を公開する方法

このブログでは、記事の `category` を **英語の固定値**で指定します。  
指定により `/blog/salonbox/` などのカテゴリページに表示されます。

### 使えるカテゴリ値（固定）
- `salonbox` → 共通（`/blog/salonbox/`）
- `hair` → ヘア（`/blog/salonbox/hair/`）
- `esthetic` → エステ（`/blog/salonbox/esthetic/`）

**ポイント**
- `category` が未指定の場合は自動で `salonbox` になります。
- **ファイルは必ずUTF-8で保存**してください（文字化けすると正しく読み取れません）。

---

## 2. 記事の作成フロー（毎回）

1) `blog-next/content/posts/` に新しい `.md` を作成  
例: `new-article.md`

2) 以下のテンプレで記入  
```md
---
title: "記事タイトル"
date: "2025-02-01"
updatedAt: "2025-02-01"
author: "編集部"
category: "salonbox"
tags:
  - "タグ1"
  - "タグ2"
excerpt: "一覧に表示される短い要約（120文字以内推奨）"
readingTime: "約5分"
metaTitle: "検索用タイトル（32文字前後）"
metaDescription: "検索用説明（110〜130字）"
ogImage: "/images/posts/<slug>/hero.webp"
hero: "/images/posts/<slug>/hero.webp"
heroAlt: "アイキャッチのalt"
image1: "/images/posts/<slug>/figure-01.webp"
image1Alt: "関連画像1のalt"
image2: "/images/posts/<slug>/figure-02.webp"
image2Alt: "関連画像2のalt"
image3: "/images/posts/<slug>/figure-03.webp"
image3Alt: "関連画像3のalt"
cta1: "冒頭直後に表示するCTA文（任意）"
cta2: "テンプレ/チェックリスト付近に表示するCTA文（任意）"
---
本文はここから。## や ### を使うと目次が自動生成されます。
```

3) 保存する  
→ ファイル名がURLのスラッグになります  
例: `new-article.md` → `/blog/new-article/`

---

## 2.5 AI用・記事作成テンプレートプロンプト

AIで本文を作成する場合は、`blog-next/ARTICLE_TEMPLATE_PROMPT_JP.md` を使ってください。  
本文の構成や文字数、文字化けチェックまで含めた指示が入っています。

---

## 2.6 本文内CTA・画像の自動挿入

以下は **自動挿入** されるため、本文に書く必要はありません。

### CTA（3箇所）
- 冒頭直後（結論の下）
- テンプレ/チェックリスト付近
- 末尾の固定CTAブロック

**CTA文言の指定（任意）**
- `cta1` を指定すると冒頭直後のCTA文が上書きされます
- `cta2` を指定するとテンプレ付近のCTA文が上書きされます
- リンク先はカテゴリ別に切り替わります（`blog-next/src/lib/posts.ts` の `CTA_LINKS_BY_CATEGORY` を参照）

### 画像（4枚）
- 画像①: `hero` が記事上部に表示されます
- 画像②: `image1` が最初のH2直前に挿入
- 画像③: `image2` が「テンプレ/チェックリスト」見出し直前に挿入
- 画像④: `image3` が最後のH2直前に挿入

---

## 3. 初回デプロイ（初めてS3へ上げるとき）

### 3-1) ビルドを実行
```powershell
cd c:\Git\LP-salonbox\blog-next
npm install
npm run build
```

### 3-2) S3へアップロード（ドラッグ&ドロップ）
1) AWSコンソールでS3バケットを開く  
2) アップロード先の場所を開く  
   - **ブログを `/blog/` で公開したい場合**: バケットのルート  
     （CloudFrontの `/blog/*` をこのバケットに向ける構成を想定）
3) **`blog-next/out/` フォルダの中身を全部選択してアップロード**

**注意**: `out` フォルダそのものはアップロードしないでください。

### 3-3) CloudFrontのキャッシュ更新
更新が反映されない場合は `/*` を無効化してください。

---

## 4. 日々のデプロイ（記事追加/修正時）

1) `blog-next/content/posts/` の `.md` を追加・修正  
2) `npm run build`  
3) `out/` の **中身全部を再アップロード**

**補足**
- `npm run build` の前に、frontmatter の画像パスを読み取り
  必要なフォルダを自動作成します。
- 画像パスが未設定の場合はフォルダは作られません。

---

## 5. 記事を削除する方法

1) `content/posts/` の該当 `.md` を削除  
2) `npm run build`  
3) `out/` の中身を再アップロード  
4) 反映されない場合はCloudFrontのキャッシュを無効化

---

## 6. よくある注意点

- **`out/` の中身を全部アップすること**（一部だと崩れます）
- **`_next/` を必ず含めること**（CSS/JSが入っています）
- 反映されない場合は **CloudFrontキャッシュ** を疑う

---

## 7. 最終チェック

以下が表示されるか確認:
- `/blog/` (一覧)
- `/blog/記事スラッグ/` (詳細)
- `/blog/salonbox/` (共通)
- `/blog/salonbox/hair/` (ヘア)
- `/blog/salonbox/esthetic/` (エステ)
