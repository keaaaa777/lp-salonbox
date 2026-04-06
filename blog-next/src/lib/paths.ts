const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/salonbox/blog";
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://mactism-products.com";

export function withBasePath(url: string) {
  if (!BASE_PATH) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("data:")) return url;
  if (url.startsWith(BASE_PATH + "/") || url === BASE_PATH) return url;
  if (!url.startsWith("/")) return url;
  return `${BASE_PATH}${url}`;
}

export function toAbsoluteUrl(url: string) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const resolved = withBasePath(url) ?? url;
  if (!resolved.startsWith("/")) return resolved;
  return new URL(resolved, SITE_ORIGIN).toString();
}
