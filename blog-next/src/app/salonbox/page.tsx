import CategoryListing from "../../components/CategoryListing";
import { getAllPosts } from "../../lib/posts";

export default function SalonboxCategoryPage() {
  const posts = getAllPosts().filter((post) => post.category === "salonbox");
  return <CategoryListing label="共通" path="/salonbox/" posts={posts} />;
}