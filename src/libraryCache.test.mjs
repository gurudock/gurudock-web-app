import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("./libraryCache.js", import.meta.url), "utf8");
const cacheModuleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  cacheGeneratedLibraryDocument,
  readCachedLibraryDocument,
  readLibraryCache,
  updateCachedLibraryDocument,
  writeLibraryCache,
} = await import(cacheModuleUrl);

const cacheStorageKey = "gurudock_library_cache:teacher@example.com";

function createStorage({ failWrites = false } = {}) {
  const values = new Map();
  let writes = 0;
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      writes += 1;
      if (failWrites) {
        const error = new Error("Storage quota exceeded");
        error.name = "QuotaExceededError";
        throw error;
      }
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    seed(key, value) {
      values.set(key, value);
    },
    get writes() {
      return writes;
    },
    value(key) {
      return values.get(key);
    },
  };
}

function setup(storage = createStorage()) {
  globalThis.localStorage = storage;
  storage.seed("user_email", "teacher@example.com");
  return storage;
}

test("synchronizes a partial API document update across all query caches", () => {
  setup();
  const original = {
    id: "doc-1",
    title: "Math revision",
    subject: "Mathematics",
    content_type: "worksheet",
    description: "Algebra practice",
    updated_at: "2026-09-26T09:00:00.000Z",
  };
  writeLibraryCache("math", [original]);
  writeLibraryCache("algebra", [{ id: "doc-1", title: "Math revision", grade: "10" }]);

  updateCachedLibraryDocument({ id: "doc-1", description: "Updated practice" });

  const mathDocument = readLibraryCache("math")[0];
  const algebraDocument = readLibraryCache("algebra")[0];
  assert.deepEqual(mathDocument, algebraDocument);
  assert.equal(mathDocument.subject, "Mathematics");
  assert.equal(mathDocument.grade, "10");
  assert.equal(mathDocument.description, "Updated practice");
});

test("normalizes whitespace and case in query keys", () => {
  setup();
  writeLibraryCache(" Math ", [{ id: "doc-1", title: "Math practice" }]);

  assert.equal(readLibraryCache("Math")[0].id, "doc-1");
  assert.equal(readLibraryCache("math")[0].id, "doc-1");
  assert.equal(readLibraryCache(" math ")[0].id, "doc-1");
});

test("treats malformed JSON and invalid root shapes as empty and recovers on write", () => {
  const storage = setup();
  for (const invalid of ["{", "null", "[]", JSON.stringify({ math: { documents: "invalid" } })]) {
    storage.seed(cacheStorageKey, invalid);
    assert.deepEqual(readLibraryCache("math"), []);
    writeLibraryCache("math", [{ id: "doc-1", title: "Math" }]);
    assert.equal(readLibraryCache("math")[0].id, "doc-1");
  }
});

test("keeps valid cache entries regardless of cachedAt age", () => {
  const storage = setup();
  storage.seed(cacheStorageKey, JSON.stringify({
    math: { cachedAt: 1, documents: [{ id: "old", title: "Math" }] },
  }));

  assert.equal(readLibraryCache("math")[0].id, "old");
});

test("adds generated documents to default and matching query caches without duplicates", () => {
  setup();
  writeLibraryCache("math", [{ id: "doc-1", title: "Math worksheet", content_type: "worksheet" }]);

  cacheGeneratedLibraryDocument({
    id: "doc-1",
    content_type: "worksheet",
    title: "Math worksheet",
    subject: "Mathematics",
  });

  assert.equal(readLibraryCache("").filter((document) => document.id === "doc-1").length, 1);
  assert.equal(readLibraryCache(" MATH ").filter((document) => document.id === "doc-1").length, 1);
  assert.equal(readCachedLibraryDocument("doc-1").subject, "Mathematics");
});

test("updates every occurrence without duplicates and preserves newer server timestamps", () => {
  setup();
  writeLibraryCache("math", [
    { id: "doc-1", title: "Old title", updated_at: "2026-09-26T11:00:00.000Z", subject: "Mathematics" },
    { id: "doc-1", title: "Duplicate" },
  ]);
  writeLibraryCache("grade 10", [{ id: "doc-1", title: "Old title", grade: "10" }]);

  updateCachedLibraryDocument({
    id: "doc-1",
    title: "New title",
    updated_at: "2026-09-26T10:00:00.000Z",
  });

  const mathDocuments = readLibraryCache("math");
  const gradeDocuments = readLibraryCache("grade 10");
  assert.equal(mathDocuments.length, 1);
  assert.equal(mathDocuments[0].title, "New title");
  assert.equal(mathDocuments[0].subject, "Mathematics");
  assert.equal(mathDocuments[0].updated_at, "2026-09-26T11:00:00.000Z");
  assert.deepEqual(mathDocuments[0], gradeDocuments[0]);
});

test("updates an existing generated document without duplicating it", () => {
  setup();
  cacheGeneratedLibraryDocument({
    id: "generated-1",
    content_type: "assignment",
    title: "Math Assignment",
    subject: "Mathematics",
  });
  writeLibraryCache(" math ", [{
    id: "generated-1",
    content_type: "assignment",
    title: "Math Assignment",
    subject: "Mathematics",
  }]);
  cacheGeneratedLibraryDocument({
    id: "generated-1",
    content_type: "assignment",
    title: "Updated Math Assignment",
  });

  const defaultDocuments = readLibraryCache("");
  assert.equal(defaultDocuments.length, 1);
  assert.equal(defaultDocuments[0].title, "Updated Math Assignment");
  assert.equal(defaultDocuments[0].subject, "Mathematics");
  assert.deepEqual(defaultDocuments[0], readLibraryCache("math")[0]);
});

test("does not resurrect documents omitted from an API response for that query", () => {
  setup();
  writeLibraryCache("math", [{ id: "doc-1", title: "Math worksheet" }]);

  writeLibraryCache("math", []);

  assert.deepEqual(readLibraryCache("math"), []);
});

test("stores and reads complete document preview content", () => {
  const storage = setup();
  const fullDocument = {
    id: "large-doc",
    content_type: "question_paper",
    title: "Large paper",
    body: "large content",
    data: { questions: ["large question"] },
    questions: ["large question"],
    sections: [{ name: "Section A" }],
  };
  cacheGeneratedLibraryDocument(fullDocument);

  const stored = JSON.parse(storage.value(cacheStorageKey));
  const cachedDocument = stored[""].documents[0];
  assert.equal(cachedDocument.body, "large content");
  assert.deepEqual(cachedDocument.data, { questions: ["large question"] });
  assert.deepEqual(cachedDocument.questions, ["large question"]);
  assert.deepEqual(cachedDocument.sections, [{ name: "Section A" }]);
  assert.equal(readCachedLibraryDocument("large-doc").body, "large content");
});

test("preserves cached full preview when a successful list response has partial metadata", () => {
  setup();
  writeLibraryCache("", [{
    id: "full-doc",
    title: "Science paper",
    content_type: "question_paper",
    body: { questions: ["Question 1"] },
    sections: [{ section_name: "Section A" }],
  }]);

  writeLibraryCache("", [{
    id: "full-doc",
    title: "Updated Science paper",
    content_type: "question_paper",
  }]);

  const cachedDocument = readCachedLibraryDocument("full-doc");
  assert.equal(cachedDocument.title, "Updated Science paper");
  assert.deepEqual(cachedDocument.body, { questions: ["Question 1"] });
  assert.deepEqual(cachedDocument.sections, [{ section_name: "Section A" }]);
});

test("quota failures never escape to the application", () => {
  setup(createStorage({ failWrites: true }));

  assert.doesNotThrow(() => writeLibraryCache("math", [{ id: "doc-1", title: "Math" }]));
  assert.doesNotThrow(() => cacheGeneratedLibraryDocument({
    id: "doc-2",
    content_type: "worksheet",
    title: "Math worksheet",
  }));
  assert.doesNotThrow(() => updateCachedLibraryDocument({ id: "doc-2", title: "Updated" }));
  assert.deepEqual(readLibraryCache("math"), []);
});

test("unavailable localStorage never breaks cache operations", () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error("Storage is unavailable");
    },
    setItem() {
      throw new Error("Storage is unavailable");
    },
  };

  assert.deepEqual(readLibraryCache("math"), []);
  assert.equal(readCachedLibraryDocument("doc-1"), null);
  assert.doesNotThrow(() => writeLibraryCache("math", [{ id: "doc-1", title: "Math" }]));
  assert.doesNotThrow(() => cacheGeneratedLibraryDocument({
    id: "doc-2",
    content_type: "worksheet",
    title: "Math worksheet",
  }));
});

test("does not write unchanged cache content", () => {
  const storage = setup();
  writeLibraryCache("math", [{ id: "doc-1", title: "Math worksheet" }]);
  const writeCount = storage.writes;

  updateCachedLibraryDocument({ id: "doc-1", title: "Math worksheet" });

  assert.equal(storage.writes, writeCount);
});
