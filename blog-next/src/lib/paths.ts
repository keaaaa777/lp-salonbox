const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(url: string) {
  if (!BASE_PATH) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("data:")) return url;
  if (url.startsWith(BASE_PATH + "/") || url === BASE_PATH) return url;
  if (!url.startsWith("/")) return url;
  return `${BASE_PATH}${url}`;
}
