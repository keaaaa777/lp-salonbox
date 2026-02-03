export const CATEGORY_DEFINITIONS = [
  { key: "common", label: "共通", path: "/common/" },
  { key: "hair", label: "ヘア", path: "/hair/" },
  { key: "esthetic", label: "エステ", path: "/esthetic/" },
] as const;

export function getCategoryInfo(category: string) {
  const match = CATEGORY_DEFINITIONS.find((item) => item.key === category);
  return (
    match ?? {
      key: category,
      label: category,
      path: "/common/",
    }
  );
}
