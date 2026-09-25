import { apiRequest } from "../apiClient";

export const PROFILE_ENDPOINTS = Object.freeze({
  profile: "/profile/",
  section: (section) => `/profile/${encodeURIComponent(section)}`,
  picture: "/profile/picture",
});

export const profileService = {
  get(options = {}) {
    return apiRequest(PROFILE_ENDPOINTS.profile, options);
  },
  updateSection(section, payload, options = {}) {
    return apiRequest(PROFILE_ENDPOINTS.section(section), { ...options, method: "PATCH", body: payload });
  },
  uploadPicture(fileOrFormData, options = {}) {
    const body = fileOrFormData instanceof FormData
      ? fileOrFormData
      : (() => {
        const formData = new FormData();
        formData.append("file", fileOrFormData);
        return formData;
      })();
    return apiRequest(PROFILE_ENDPOINTS.picture, { ...options, method: "POST", body });
  },
};

export default profileService;
