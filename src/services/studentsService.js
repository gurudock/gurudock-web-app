import { apiRequest } from "../apiClient";

export const STUDENTS_ENDPOINTS = Object.freeze({
  collection: "/students",
  bulk: "/students/bulk",
  item: (studentId) => `/students/${encodeURIComponent(studentId)}`,
});

export const studentsService = {
  list(options = {}) {
    return apiRequest(STUDENTS_ENDPOINTS.collection, options);
  },
  createBulk(students, options = {}) {
    return apiRequest(STUDENTS_ENDPOINTS.bulk, { ...options, method: "POST", body: students });
  },
  get(studentId, options = {}) {
    return apiRequest(STUDENTS_ENDPOINTS.item(studentId), options);
  },
  update(studentId, payload, options = {}) {
    return apiRequest(STUDENTS_ENDPOINTS.item(studentId), { ...options, method: "PUT", body: payload });
  },
  delete(studentId, options = {}) {
    return apiRequest(STUDENTS_ENDPOINTS.item(studentId), { ...options, method: "DELETE" });
  },
};

export default studentsService;
