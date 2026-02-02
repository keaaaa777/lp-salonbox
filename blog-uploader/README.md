# Internal Publisher (Desktop)

This folder is isolated from the existing `blog-next/` app.
It is a desktop authoring tool for non-technical staff:

- Select one Markdown file
- Select hero + up to 3 reference images
- Generate a preview
- Publish sources to S3
- Optionally trigger AWS CodeBuild

## What it uploads

The tool uploads **source files** to a source bucket:

- `posts/<slug>.md`
- `images/posts/<slug>/hero.<ext>`
- `images/posts/<slug>/figure-01.<ext>`
- `images/posts/<slug>/figure-02.<ext>`
- `images/posts/<slug>/figure-03.<ext>`

These paths are designed to match the expectations in `blog-next/src/lib/posts.ts`.

## Required AWS side

To update the production blog (static export), you still need a build pipeline:

1. Fetch sources from the source bucket
2. Copy into the blog repo structure
   - `content/posts/*.md`
   - `public/images/posts/<slug>/*`
3. Run the blog build/export
4. Sync `out/` to the production bucket
5. Invalidate CloudFront

This desktop tool only handles step 1 (and optionally triggers step 3 via CodeBuild).

### Recommended CodeBuild flow

This repo includes a buildspec for production sync:

- `blog-next/buildspec.prod.yml`

It expects the CodeBuild project to provide the environment variables below.

### Local build + production upload (no CodeBuild)

Set `PUBLISHER_LOCAL_BUILD=1` to build the blog on the same machine and upload
the `blog-next/out/` contents to the production bucket, then optionally invalidate
CloudFront. This requires a working Node.js environment and access to the
`blog-next` folder (see `PUBLISHER_BLOG_NEXT_DIR`).

## Configuration (environment variables)

Set these before running the app. The UI does not expose AWS settings.

- `PUBLISHER_AWS_REGION` (required)
- `PUBLISHER_SOURCE_BUCKET` (required unless local build is enabled)
- `PUBLISHER_POSTS_PREFIX` (optional, default: `posts`)
- `PUBLISHER_IMAGES_PREFIX` (optional, default: `images`)
- `PUBLISHER_CODEBUILD_PROJECT` (optional)
- `PUBLISHER_PROD_BUCKET` (optional, for production upload)
- `PUBLISHER_PROD_PREFIX` (optional, for production upload; example: `blog`)
- `PUBLISHER_CLOUDFRONT_DISTRIBUTION_ID` (optional, for CloudFront invalidation)
- `PUBLISHER_LOCAL_BUILD` (optional, set `1` to build locally and upload `out/`)
- `PUBLISHER_BLOG_NEXT_DIR` (optional, path to `blog-next`; default: `../blog-next`)
- `AWS_ACCESS_KEY_ID` (optional)
- `AWS_SECRET_ACCESS_KEY` (optional)
- `AWS_REGION` (optional)

## Local development

From this folder:

```powershell
cd c:\Git\LP-salonbox\internal-publisher
npm install
npm run dev
```

## Run once

```powershell
cd c:\Git\LP-salonbox\internal-publisher
npm install
npm start
```

## Notes

- AWS credentials are resolved by the normal AWS SDK chain
  (for example: `AWS_PROFILE`, environment variables, or shared config files).
- This is a first scaffold. The next step is to wire a CodeBuild job that
  performs the blog build + deploy automatically.
