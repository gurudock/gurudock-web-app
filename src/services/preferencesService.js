import { apiRequest } from "../apiClient";

export const PREFERENCES_ENDPOINTS = Object.freeze({
  root: "/preferences/",
  replace: "/preferences/replace",
});

export const preferencesService = {
  get(options = {}) {
    return apiRequest(PREFERENCES_ENDPOINTS.root, options);
  },
  replace(preferences, options = {}) {
    return apiRequest(PREFERENCES_ENDPOINTS.replace, {
      ...options,
      method: "PUT",
      body: { preferences },
    });
  },
};

export default preferencesService;
