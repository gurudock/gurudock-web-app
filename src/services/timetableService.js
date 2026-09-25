import { apiRequest } from "../apiClient";

export const TIMETABLE_ENDPOINTS = Object.freeze({
  collection: "/timetable",
  bulk: "/timetable/bulk",
  extract: "/timetable/extract",
});

export const timetableService = {
  list(options = {}) {
    return apiRequest(TIMETABLE_ENDPOINTS.collection, options);
  },
  saveBulk(entries, options = {}) {
    return apiRequest(TIMETABLE_ENDPOINTS.bulk, { ...options, method: "POST", body: entries });
  },
  extract(fileOrFormData, options = {}) {
    const body = fileOrFormData instanceof FormData
      ? fileOrFormData
      : (() => {
        const formData = new FormData();
        formData.append("file", fileOrFormData);
        return formData;
      })();
    return apiRequest(TIMETABLE_ENDPOINTS.extract, { ...options, method: "POST", body });
  },
};

export default timetableService;
