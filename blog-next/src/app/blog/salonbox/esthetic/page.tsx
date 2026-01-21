import CategoryListing from "../../../../components/CategoryListing";
import { getAllPosts } from "../../../../lib/posts";

export default function EstheticCategoryPage() {
  const posts = getAllPosts().filter((post) => post.category === "esthetic");
  return (
    <CategoryListing
      label="エステ"
      path="/blog/salonbox/esthetic/"
      posts={posts}
    />
  );
}
