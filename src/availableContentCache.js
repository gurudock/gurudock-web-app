const AVAILABLE_CONTENT_CACHE_KEY = "gurudock_available_content_cache";

function getCacheKey() {
  const user = localStorage.getItem("user_email") || localStorage.getItem("user_name") || "authenticated";
  return `${AVAILABLE_CONTENT_CACHE_KEY}:${user.toLowerCase()}`;
}

export function readAvailableContentCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(getCacheKey()) || "null");
    if (
      !cached ||
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
