// Profile photos are stored as private object paths ("/objects/...") and
// served through the authenticated storage route. Older records may hold a
// full external URL — pass those through unchanged.
export function photoSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/objects/")) {
    return `${import.meta.env.BASE_URL}api/storage${url}`;
  }
  return url;
}
