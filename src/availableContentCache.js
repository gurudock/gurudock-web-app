const AVAILABLE_CONTENT_CACHE_KEY = "gurudock_available_content_cache";
const AVAILABLE_CONTENT_CACHE_TTL = 24 * 60 * 60 * 1000;

function getCacheKey() {
  const user = localStorage.getItem("user_email") || localStorage.getItem("user_name") || "authenticated";
  return `${AVAILABLE_CONTENT_CACHE_KEY}:${user.toLowerCase()}`;
}

export function readAvailableContentCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(getCacheKey()) || "null");
    if (
      !cached ||
      Date.now() - cached.cachedAt > AVAILABLE_CONTENT_CACHE_TTL ||
      !cached.data ||
      typeof cached.data !== "object" ||
      Array.isArray(cached.data)
    ) return null;
    return cached.data;
  } catch {
    return null;
  }
}

export function writeAvailableContentCache(data) {
  try {
    localStorage.setItem(getCacheKey(), JSON.stringify({
      cachedAt: Date.now(),
      data,
    }));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}
