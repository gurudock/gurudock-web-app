import { API_BASE_URL, apiRequest } from "../apiClient";

export const CONTENT_ENDPOINTS = Object.freeze({
  availableContent: "/content/available-content",
  chaptersTopics: "/content/chapters-topics",
  briefing: "/briefing/pull/stand_alone",
  generateLessonPlan: "/api/lesson-plan/generate",
  generateWorksheet: "/worksheet/generate",
  generateAssignment: "/assignment/generate",
  generateQuestionPaper: "/question-paper/generate",
  feedback: "/api/feedback",
});

export const contentService = {
  getAvailableContent(options = {}) {
    return apiRequest(CONTENT_ENDPOINTS.availableContent, options);
  },
  getChaptersTopics(payload, options = {}) {
    return apiRequest(CONTENT_ENDPOINTS.chaptersTopics, { ...options, method: "POST", body: payload });
  },
  pullBriefing(payload, options = {}) {
    return apiRequest(CONTENT_ENDPOINTS.briefing, { ...options, method: "POST", body: payload });
  },
  generateLessonPlan(payload, options = {}) {
    return apiRequest(CONTENT_ENDPOINTS.generateLessonPlan, { ...options, method: "POST", body: payload }, {
      baseUrl: import.meta.env.DEV ? "" : API_BASE_URL,
    });
  },
  generateWorksheet(payload, options = {}) {
    return apiRequest(CONTENT_ENDPOINTS.generateWorksheet, { ...options, method: "POST", body: payload });
  },
  generateAssignment(payload, options = {}) {
    return apiRequest(CONTENT_ENDPOINTS.generateAssignment, { ...options, method: "POST", body: payload });
  },
  generateQuestionPaper(payload, options = {}) {
    return apiRequest(CONTENT_ENDPOINTS.generateQuestionPaper, { ...options, method: "POST", body: payload });
  },
  submitFeedback(payload, options = {}) {
    return apiRequest(CONTENT_ENDPOINTS.feedback, { ...options, method: "POST", body: payload });
  },
};

export default contentService;
