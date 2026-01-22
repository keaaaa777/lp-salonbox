import BlogIndex from "../../../components/BlogIndex";
import {
  getAllPosts,
  getCategoryCounts,
  getFeaturedPosts,
  getPagedPosts,
  getTagCounts,
} from "../../../lib/posts";

const POSTS_PER_PAGE = 6;

export const dynamicParams = false;

export async function generateStaticParams() {
  const allPosts = getAllPosts();
  const { totalPages } = getPagedPosts(allPosts, 1, POSTS_PER_PAGE);
  return Array.from({ length: totalPages }, (_, index) => ({
    page: String(index + 1),
  }));
}

export default async function PageList({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  const pageNumber = Number(page);
  const allPosts = getAllPosts();
  const featured = getFeaturedPosts(allPosts, 3);
  const { posts, totalPages } = getPagedPosts(
    allPosts,
    pageNumber,
    POSTS_PER_PAGE
  );
  const popular = allPosts.slice(0, 5);
  const categories = getCategoryCounts(allPosts);
  const tags = getTagCounts(allPosts);

  return (
    <BlogIndex
      featured={featured}
      posts={posts}
      popular={popular}
      categories={categories}
      tags={tags}
      currentPage={pageNumber}
      totalPages={totalPages}
    />
  );
}
