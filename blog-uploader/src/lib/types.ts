export type ImageSlot = "hero" | "image1" | "image2" | "image3";

export type ImageSelection = Partial<Record<ImageSlot, string>>;

export type PublisherSettings = {
  region: string;
  sourceBucket?: string;
  postsPrefix: string;
  imagesPrefix: string;
  prodBucket?: string;
  prodPrefix?: string;
  stgBucket?: string;
  stgPrefix?: string;
  prodCloudfrontDistributionId?: string;
  stgCloudfrontDistributionId?: string;
  cloudfrontDistributionId?: string;
  codebuildProject?: string;
  localBuildEnabled?: boolean;
  blogNextDir?: string;
};

export type LoadedPost = {
  slug: string;
  sourcePath: string;
  markdown: string;
  data: Record<string, unknown>;
  content: string;
};

export type PreviewResult = {
  slug: string;
  title: string;
  html: string;
  markdownWithFrontmatter: string;
  imageKeys: Record<ImageSlot, string | undefined>;
};

export type PublishResult = {
  slug: string;
  uploadedKeys: string[];
  codebuildStarted: boolean;
  localBuildEnabled: boolean;
  prodUploadCompleted: boolean;
  cloudfrontInvalidated: boolean;
};

export type PublishProgress = {
  phase: string;
  done?: number;
  total?: number;
};

export type S3DiffStatus = "add" | "remove" | "update" | "same";

export type S3DiffItem = {
  key: string;
  status: S3DiffStatus;
  localSize?: number;
  remoteSize?: number;
  isHtml: boolean;
};

export type S3DiffSummary = {
  bucket: string;
  prefix: string;
  outDir: string;
  items: S3DiffItem[];
  counts: {
    add: number;
    update: number;
    remove: number;
    same: number;
  };
};

export type DownloadResult = {
  downloaded: number;
  targetDir?: string;
  canceled?: boolean;
  failedKeys?: string[];
};

export type PrefixDownloadResult = {
  downloaded: number;
  outDir: string;
  failedKeys?: string[];
};

export type OutArticle = {
  slug: string;
  title: string;
  path: string;
};

export type DeleteArticleResult = {
  slug: string;
  removedPaths: string[];
  missingPaths: string[];
};
