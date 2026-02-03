import CategoryListing from "../../components/CategoryListing";
import { getAllPosts } from "../../lib/posts";

export default function HairCategoryPage() {
  const posts = getAllPosts().filter((post) => post.category === "hair");
  return <CategoryListing label="ヘア" path="/hair/" posts={posts} />;
}
