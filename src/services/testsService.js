import { apiRequest } from "../apiClient";

export const TESTS_ENDPOINTS = Object.freeze({
  collection: "/tests",
  item: (testId) => `/tests/${encodeURIComponent(testId)}`,
  marks: (testId) => `/tests/${encodeURIComponent(testId)}/marks`,
});

export const testsService = {
  list(options = {}) {
    return apiRequest(TESTS_ENDPOINTS.collection, options);
  },
  create(payload, options = {}) {
    return apiRequest(TESTS_ENDPOINTS.collection, { ...options, method: "POST", body: payload });
  },
  get(testId, options = {}) {
    return apiRequest(TESTS_ENDPOINTS.item(testId), options);
  },
  delete(testId, options = {}) {
    return apiRequest(TESTS_ENDPOINTS.item(testId), { ...options, method: "DELETE" });
  },
  saveMarks(testId, marks, options = {}) {
    return apiRequest(TESTS_ENDPOINTS.marks(testId), { ...options, method: "POST", body: marks });
  },
};

export default testsService;
