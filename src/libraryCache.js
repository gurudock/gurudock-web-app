const LIBRARY_CACHE_KEY = "gurudock_library_cache";
export const LIBRARY_CACHE_TTL = 24 * 60 * 60 * 1000;

function getLibraryCacheKey() {
  const user = localStorage.getItem("user_email") || localStorage.getItem("user_name") || "authenticated";
  return `${LIBRARY_CACHE_KEY}:${user.toLowerCase()}`;
}

export function readLibraryCache(query = "") {
  try {
    const cached = JSON.parse(localStorage.getItem(getLibraryCacheKey()) || "{}");
    const entry = cached[query];
    if (!entry || Date.now() - entry.cachedAt > LIBRARY_CACHE_TTL || !Array.isArray(entry.documents)) return [];
    return entry.documents;
  } catch {
    return [];
  }
}

export function readCachedLibraryDocument(documentId) {
  if (!documentId) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(getLibraryCacheKey()) || "{}");
    for (const entry of Object.values(cached)) {
      if (!Array.isArray(entry?.documents)) continue;
      const document = entry.documents.find((item) => item.id === documentId);
      if (document) return document;
    }
  } catch {
    return null;
  }
  return null;
}

export function writeLibraryCache(query = "", documents) {
  try {
    const key = getLibraryCacheKey();
    const cached = JSON.parse(localStorage.getItem(key) || "{}");
    const previousDocuments = Array.isArray(cached[query]?.documents) ? cached[query].documents : [];
    const previousById = new Map(previousDocuments.map((document) => [document.id, document]));
    const mergedDocuments = documents.map((document) => ({
      ...(previousById.get(document.id) || {}),
      ...document,
    }));
    cached[query] = { cachedAt: Date.now(), documents: mergedDocuments };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}

export function cacheGeneratedLibraryDocument(document) {
  if (!document?.id || !document?.content_type) return;
  try {
    const key = getLibraryCacheKey();
    const cached = JSON.parse(localStorage.getItem(key) || "{}");
    const timestamp = new Date().toISOString();
    const generatedDocument = {
      ...document,
      created_at: document.created_at || timestamp,
      updated_at: document.updated_at || timestamp,
    };
    const queries = Object.keys(cached);
    if (!queries.includes("")) queries.push("");
    queries.forEach((query) => {
      const documents = Array.isArray(cached[query]?.documents) ? cached[query].documents : [];
      const existingIndex = documents.findIndex((item) => item.id === generatedDocument.id);
      if (existingIndex >= 0) {
        documents[existingIndex] = { ...documents[existingIndex], ...generatedDocument };
      } else if (!query || JSON.stringify(generatedDocument).toLowerCase().includes(query.toLowerCase())) {
        documents.unshift(generatedDocument);
      }
      cached[query] = { cachedAt: Date.now(), documents };
    });
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}

export function updateCachedLibraryDocument(document) {
  if (!document?.id) return;
  try {
    const key = getLibraryCacheKey();
    const cached = JSON.parse(localStorage.getItem(key) || "{}");
    Object.keys(cached).forEach((query) => {
      const documents = cached[query]?.documents;
      if (!Array.isArray(documents)) return;
      cached[query].documents = documents.map((item) =>
        item.id === document.id ? { ...item, ...document } : item,
      );
    });
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}
