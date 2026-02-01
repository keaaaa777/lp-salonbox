export type ImageSlot = "hero" | "image1" | "image2" | "image3";

export type ImageSelection = Partial<Record<ImageSlot, string>>;

export type PublisherSettings = {
  region: string;
  sourceBucket?: string;
  postsPrefix: string;
  imagesPrefix: string;
  prodBucket?: string;
  prodPrefix?: string;
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
