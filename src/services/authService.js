import { apiRequest, clearStoredSession, dispatchAuthChanged, setStoredSession } from "../apiClient";

export const AUTH_ENDPOINTS = Object.freeze({
  refresh: "/auth/refresh",
  login: "/auth/login",
  register: "/auth/register",
  verifyEmailOtp: "/auth/verify-email-otp",
  requestPasswordOtp: "/auth/forgot-password/request-otp",
  verifyPasswordOtp: "/auth/forgot-password/verify-otp",
  resetPassword: "/auth/forgot-password/reset",
  resendEmailOtp: "/auth/resend-email-otp",
  changePassword: "/auth/change-password",
  me: "/auth/me",
});

async function storeAuthentication(request) {
  const data = await request;
  setStoredSession(data);
  dispatchAuthChanged();
  return data;
}

export const authService = {
  login(credentials, options = {}) {
    const body = new URLSearchParams({
      username: credentials.email || credentials.username || "",
      password: credentials.password || "",
    });
    return storeAuthentication(apiRequest(AUTH_ENDPOINTS.login, {
      ...options,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...options.headers },
      body,
    }, { refreshOnUnauthorized: false }));
  },
  register(payload, options = {}) {
    return apiRequest(AUTH_ENDPOINTS.register, { ...options, method: "POST", body: payload }, { refreshOnUnauthorized: false });
  },
  verifyEmailOtp(payload, options = {}) {
    return storeAuthentication(apiRequest(AUTH_ENDPOINTS.verifyEmailOtp, {
      ...options,
      method: "POST",
      body: payload,
    }, { refreshOnUnauthorized: false }));
  },
  requestPasswordOtp(payload, options = {}) {
    return apiRequest(AUTH_ENDPOINTS.requestPasswordOtp, { ...options, method: "POST", body: payload }, { refreshOnUnauthorized: false });
  },
  verifyPasswordOtp(payload, options = {}) {
    return apiRequest(AUTH_ENDPOINTS.verifyPasswordOtp, { ...options, method: "POST", body: payload }, { refreshOnUnauthorized: false });
  },
  resetPassword(payload, options = {}) {
    return apiRequest(AUTH_ENDPOINTS.resetPassword, { ...options, method: "POST", body: payload }, { refreshOnUnauthorized: false });
  },
  resendEmailOtp(payload, options = {}) {
    return apiRequest(AUTH_ENDPOINTS.resendEmailOtp, { ...options, method: "POST", body: payload }, { refreshOnUnauthorized: false });
  },
  changePassword(payload, options = {}) {
    return apiRequest(AUTH_ENDPOINTS.changePassword, { ...options, method: "PATCH", body: payload }, options);
  },
  getCurrentUser(options = {}) {
    return apiRequest(AUTH_ENDPOINTS.me, options);
  },
  logout() {
    clearStoredSession();
  },
};

export default authService;
