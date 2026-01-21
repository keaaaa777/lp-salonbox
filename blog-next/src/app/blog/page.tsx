import BlogIndex from "../../components/BlogIndex";
import {
  getAllPosts,
  getCategoryCounts,
  getFeaturedPosts,
  getPagedPosts,
  getTagCounts,
} from "../../lib/posts";

const POSTS_PER_PAGE = 6;

export default function HomePage() {
  const allPosts = getAllPosts();
  const featured = getFeaturedPosts(allPosts, 3);
  const { posts, totalPages } = getPagedPosts(allPosts, 1, POSTS_PER_PAGE);
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
      currentPage={1}
      totalPages={totalPages}
    />
  );
}
