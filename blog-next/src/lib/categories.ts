export const CATEGORY_DEFINITIONS = [
  { key: "salonbox", label: "共通", path: "/blog/salonbox/" },
  { key: "hair", label: "ヘア", path: "/blog/salonbox/hair/" },
  { key: "esthetic", label: "エステ", path: "/blog/salonbox/esthetic/" },
] as const;

export function getCategoryInfo(category: string) {
  const match = CATEGORY_DEFINITIONS.find((item) => item.key === category);
  return (
    match ?? {
      key: category,
      label: category,
      path: "/blog/salonbox/",
    }
  );
}
