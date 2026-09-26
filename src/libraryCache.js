const LIBRARY_CACHE_KEY = "gurudock_library_cache";

const SEARCHABLE_FIELDS = [
  "title",
  "subject",
  "grade",
  "class_level",
  "board",
  "chapter",
  "content_type",
  "description",
  "name",
];

function normalizeQuery(query = "") {
  return String(query ?? "").trim().toLowerCase();
}

function getLibraryCacheKey() {
  try {
    const userEmail = localStorage.getItem("user_email");
    const userName = localStorage.getItem("user_name");
    const user = typeof userEmail === "string" && userEmail
      ? userEmail
      : typeof userName === "string" && userName
        ? userName
        : "authenticated";
    return `${LIBRARY_CACHE_KEY}:${user.toLowerCase()}`;
  } catch {
    return null;
  }
}

function getStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDocument(value) {
  return isRecord(value) && (typeof value.id === "string" || typeof value.id === "number");
}

function isValidEntry(entry) {
  return isRecord(entry)
    && Array.isArray(entry.documents)
    && entry.documents.every(isDocument);
}

function getCache() {
  const storage = getStorage();
  const key = getLibraryCacheKey();
  if (!storage || !key) return { storage: null, key: null, raw: null, entries: Object.create(null) };

  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return { storage: null, key: null, raw: null, entries: Object.create(null) };
  }

  if (!raw) return { storage, key, raw, entries: Object.create(null) };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { storage, key, raw, entries: Object.create(null) };
  }
  if (!isRecord(parsed)) return { storage, key, raw, entries: Object.create(null) };

  const entries = Object.create(null);
  Object.keys(parsed).forEach((storedQuery) => {
    const entry = parsed[storedQuery];
    if (!isValidEntry(entry)) return;
    const query = normalizeQuery(storedQuery);
    const previous = entries[query];
    const documents = previous
      ? mergeDocumentLists(previous.documents, entry.documents)
      : deduplicateDocuments(entry.documents);
    entries[query] = {
      cachedAt: Math.max(previous?.cachedAt || 0, Number.isFinite(entry.cachedAt) ? entry.cachedAt : 0),
      documents,
    };
  });

  return { storage, key, raw, entries };
}

function isNewerTimestamp(first, second) {
  const firstTime = typeof first === "string" ? Date.parse(first) : NaN;
  const secondTime = typeof second === "string" ? Date.parse(second) : NaN;
  return Number.isFinite(firstTime) && Number.isFinite(secondTime) && firstTime > secondTime;
}

function mergeDocuments(existing, incoming) {
  const merged = { ...existing, ...incoming };
  if (isNewerTimestamp(existing?.updated_at, incoming?.updated_at)) {
    merged.updated_at = existing.updated_at;
  }
  return merged;
}

function deduplicateDocuments(documents) {
  const byId = new Map();
  documents.forEach((document) => {
    if (!isDocument(document)) return;
    const id = String(document.id);
    const existing = byId.get(id);
    byId.set(id, existing ? mergeDocuments(existing, document) : document);
  });
  return Array.from(byId.values());
}

function mergeDocumentLists(existingDocuments, incomingDocuments) {
  const existingById = new Map(deduplicateDocuments(existingDocuments).map((document) => [String(document.id), document]));
  return deduplicateDocuments(incomingDocuments.map((document) => (
    mergeDocuments(existingById.get(String(document.id)), document)
  )));
}

function getCanonicalDocuments(entries) {
  const canonical = new Map();
  const sortedEntries = Object.values(entries).sort((first, second) => second.cachedAt - first.cachedAt);
  sortedEntries.forEach((entry) => {
    entry.documents.forEach((document) => {
      const id = String(document.id);
      const existing = canonical.get(id);
      canonical.set(id, existing ? mergeDocuments(document, existing) : document);
    });
  });
  return canonical;
}

function matchesQuery(document, query) {
  if (!query) return true;
  return SEARCHABLE_FIELDS.some((field) => {
    const value = document[field];
    if (typeof value === "string" || typeof value === "number") {
      return normalizeQuery(value).includes(query);
    }
    return Array.isArray(value) && value.some((item) =>
      (typeof item === "string" || typeof item === "number") && normalizeQuery(item).includes(query),
    );
  });
}

function serializeCache(entries) {
  return JSON.stringify(entries);
}

function safelyWriteCache({ storage, key, raw, entries }) {
  if (!storage || !key) return;

  try {
    const serialized = serializeCache(entries);
    if (serialized !== raw) storage.setItem(key, serialized);
  } catch {
    const fallbackEntries = Object.assign(Object.create(null), entries);
    const removableQueries = Object.keys(fallbackEntries)
      .filter((query) => query !== "")
      .sort((first, second) => fallbackEntries[first].cachedAt - fallbackEntries[second].cachedAt);

    while (removableQueries.length) {
      delete fallbackEntries[removableQueries.shift()];
      try {
        storage.setItem(key, serializeCache(fallbackEntries));
        return;
      } catch {
        continue;
      }
    }
  }
}

function writeEntry(entries, query, documents, cachedAt = Date.now(), refreshCachedAt = false) {
  const nextDocuments = deduplicateDocuments(documents);
  const previous = entries[query];
  if (previous && JSON.stringify(previous.documents) === JSON.stringify(nextDocuments)) {
    if (refreshCachedAt && previous.cachedAt !== cachedAt) {
      entries[query] = { cachedAt, documents: previous.documents };
      return true;
    }
    return false;
  }
  entries[query] = { cachedAt, documents: nextDocuments };
  return true;
}

export function readLibraryCache(query = "") {
  const normalizedQuery = normalizeQuery(query);
  const { entries } = getCache();
  const entry = entries[normalizedQuery];
  return entry ? entry.documents : [];
}

export function readCachedLibraryDocument(documentId) {
  if (documentId === null || documentId === undefined || documentId === "") return null;
  const { entries } = getCache();
  return getCanonicalDocuments(entries).get(String(documentId)) || null;
}

export function writeLibraryCache(query = "", documents) {
  if (!Array.isArray(documents)) return;

  const cache = getCache();
  if (!cache.storage || !cache.key) return;

  const normalizedQuery = normalizeQuery(query);
  const canonical = getCanonicalDocuments(cache.entries);
  const incomingDocuments = deduplicateDocuments(documents.filter(isDocument).map((document) => {
    const previous = canonical.get(String(document.id));
    const merged = previous ? mergeDocuments(previous, document) : document;
    canonical.set(String(document.id), merged);
    return merged;
  }));

  Object.keys(cache.entries).forEach((cachedQuery) => {
    const synchronized = cache.entries[cachedQuery].documents.map((document) =>
      canonical.get(String(document.id)) || document,
    );
    cache.entries[cachedQuery].documents = deduplicateDocuments(synchronized);
  });

  writeEntry(cache.entries, normalizedQuery, incomingDocuments, Date.now(), true);
  safelyWriteCache(cache);
}

export function cacheGeneratedLibraryDocument(document) {
  if (!isDocument(document) || !document.content_type) return;

  const cache = getCache();
  if (!cache.storage || !cache.key) return;

  const now = new Date().toISOString();
  const generatedDocument = {
    ...document,
    created_at: document.created_at || now,
    updated_at: document.updated_at || now,
  };
  const canonical = getCanonicalDocuments(cache.entries);
  const existing = canonical.get(String(generatedDocument.id));
  const synchronizedDocument = existing ? mergeDocuments(existing, generatedDocument) : generatedDocument;
  const queries = new Set(["", ...Object.keys(cache.entries)]);

  queries.forEach((query) => {
    const currentDocuments = cache.entries[query]?.documents || [];
    const matches = matchesQuery(synchronizedDocument, query);
    const nextDocuments = currentDocuments.filter((item) => String(item.id) !== String(document.id));
    if (query === "" || matches) nextDocuments.unshift(synchronizedDocument);
    writeEntry(cache.entries, query, nextDocuments);
  });

  safelyWriteCache(cache);
}

export function updateCachedLibraryDocument(document) {
  if (!isDocument(document)) return;

  const cache = getCache();
  if (!cache.storage || !cache.key) return;

  const canonical = getCanonicalDocuments(cache.entries);
  const existing = canonical.get(String(document.id));
  if (!existing) return;
  const synchronizedDocument = mergeDocuments(existing, document);

  Object.keys(cache.entries).forEach((query) => {
    const documents = cache.entries[query].documents;
    if (!documents.some((item) => String(item.id) === String(document.id))) return;
    const nextDocuments = documents.map((item) =>
      String(item.id) === String(document.id) ? synchronizedDocument : item,
    );
    writeEntry(cache.entries, query, nextDocuments);
  });

  safelyWriteCache(cache);
}
