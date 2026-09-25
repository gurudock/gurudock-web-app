import { API_BASE_URL, apiRequest, joinApiUrl } from "../apiClient";

export const LIBRARY_ENDPOINTS = Object.freeze({
  collection: "/api/library",
  item: (contentType, contentId) => `/api/library/${encodeURIComponent(contentType)}/${encodeURIComponent(contentId)}`,
  generatePdf: "/pdf/generate",
  generateDocx: "/docx/generate",
  generateAnswerKey: "/answer-key/generate",
  lessonPlan: (lessonPlanId) => import.meta.env.DEV
    ? `/api/lesson-plan/${encodeURIComponent(lessonPlanId)}`
    : `/api/lesson-plan/${encodeURIComponent(lessonPlanId)}`,
});

const libraryUrl = (endpoint) => joinApiUrl(`${API_BASE_URL}${endpoint}`);

function withQuery(path, params) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export const libraryService = {
  list(params = {}, options = {}) {
    return apiRequest(libraryUrl(withQuery(LIBRARY_ENDPOINTS.collection, params)), options);
  },
  get(contentType, contentId, options = {}) {
    return apiRequest(libraryUrl(LIBRARY_ENDPOINTS.item(contentType, contentId)), options);
  },
  generatePdf(payload, options = {}) {
    return apiRequest(libraryUrl(LIBRARY_ENDPOINTS.generatePdf), { ...options, method: "POST", body: payload });
  },
  generateDocx(payload, options = {}) {
    return apiRequest(libraryUrl(LIBRARY_ENDPOINTS.generateDocx), { ...options, method: "POST", body: payload });
  },
  generateAnswerKey(payload, options = {}) {
    return apiRequest(libraryUrl(LIBRARY_ENDPOINTS.generateAnswerKey), { ...options, method: "POST", body: payload });
  },
  updateLessonPlan(lessonPlanId, payload, options = {}) {
    return apiRequest(LIBRARY_ENDPOINTS.lessonPlan(lessonPlanId), { ...options, method: "PUT", body: payload }, {
      baseUrl: import.meta.env.DEV ? "" : API_BASE_URL,
    });
  },
};

export default libraryService;
