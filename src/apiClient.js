export const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
export const DEFAULT_TIMEOUT_MS = 30000;

const SESSION_KEYS = ["access_token", "refresh_token", "user_name", "user_email"];
let refreshRequest = null;

export class ApiError extends Error {
  constructor(message, { status = null, code = "API_ERROR", details = null, response = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.response = response;
  }
}

export function joinApiUrl(path, baseUrl = API_BASE_URL) {
  const value = path instanceof URL ? path.toString() : String(path);
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(value)) return value;

  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (base && (value === base || value.startsWith(`${base}/`) || value.startsWith(`${base}?`))) {
    return value;
  }
  const endpoint = value.replace(/^\/+/, "");
  return base ? `${base}/${endpoint}` : `/${endpoint}`;
}

function createAbortContext(signal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId;

  const abortFromCaller = () => controller.abort(signal.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      const error = new Error(`Request timed out after ${timeoutMs} ms.`);
      error.name = "TimeoutError";
      controller.abort(error);
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    dispose() {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

function isNetworkError(error) {
  return error?.name === "TypeError"
    || error?.message === "Failed to fetch"
    || error?.message === "NetworkError"
    || (typeof navigator !== "undefined" && navigator.onLine === false);
}

function getErrorMessage(payload, fallback) {
  const detail = payload?.detail ?? payload?.error ?? payload?.message;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => (
      typeof item === "string" ? item : item?.msg || item?.message || JSON.stringify(item)
    )).join(", ");
  }
  if (detail && typeof detail === "object") {
    return detail.message || detail.msg || JSON.stringify(detail);
  }
  return fallback;
}

export function normalizeApiError(error, { payload, response, fallback = "The request failed." } = {}) {
  if (error instanceof ApiError) return error;
  if (error?.name === "AbortError") return error;
  if (error?.name === "TimeoutError") {
    return new ApiError(error.message || "The request timed out.", {
      code: "TIMEOUT",
      response,
      cause: error,
    });
  }
  if (!response && isNetworkError(error)) {
    return new ApiError("Unable to reach the server. Check your connection and try again.", {
      code: "NETWORK_ERROR",
      response,
      cause: error,
    });
  }
  return new ApiError(getErrorMessage(payload, error?.message || fallback), {
    status: response?.status ?? null,
    code: payload?.code || (response ? "HTTP_ERROR" : "API_ERROR"),
    details: payload ?? null,
    response: response ?? null,
    cause: error,
  });
}

export async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    if (response.headers.get("content-type")?.includes("json")) {
      throw new ApiError("The server returned invalid JSON.", {
        status: response.status,
        code: "INVALID_JSON",
        response,
        cause: error,
      });
    }
    return text;
  }
}

export function dispatchAuthChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("auth-changed"));
}

export function clearStoredSession({ notify = true } = {}) {
  if (typeof localStorage === "undefined") return false;
  const hadSession = SESSION_KEYS.some((key) => localStorage.getItem(key) !== null);
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  if (hadSession && notify) dispatchAuthChanged();
  return hadSession;
}

export function setStoredSession({ access_token: accessToken, refresh_token: refreshToken } = {}) {
  if (typeof localStorage === "undefined") return;
  if (accessToken) localStorage.setItem("access_token", accessToken);
  if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
}

async function refreshAccessToken() {
  if (refreshRequest) return refreshRequest;

  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) {
    clearStoredSession();
    throw new ApiError("Your session has expired. Please log in again.", { code: "SESSION_EXPIRED" });
  }

  refreshRequest = (async () => {
    const abortContext = createAbortContext(undefined);
    try {
      const response = await fetch(joinApiUrl("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: abortContext.signal,
      });
      const data = await parseJsonResponse(response);
      if (!response.ok || !data?.access_token || !data?.refresh_token) {
        throw normalizeApiError(null, {
          payload: data,
          response,
          fallback: "Your session has expired. Please log in again.",
        });
      }
      setStoredSession(data);
      return data.access_token;
    } catch (error) {
      if (!isNetworkError(error) && error?.name !== "AbortError") {
        clearStoredSession();
        throw normalizeApiError(error, { fallback: "Your session has expired. Please log in again." });
      }
      if (abortContext.timedOut) {
        throw normalizeApiError(Object.assign(new Error("The token refresh timed out."), { name: "TimeoutError" }));
      }
      throw normalizeApiError(error);
    } finally {
      abortContext.dispose();
    }
  })().finally(() => {
    refreshRequest = null;
  });

  return refreshRequest;
}

async function fetchWithAuth(url, options, refreshOnUnauthorized = true, baseUrl = API_BASE_URL) {
  const requestOptions = { ...options };
  const headers = new Headers(requestOptions.headers || {});
  const body = requestOptions.body;

  if (body && typeof body !== "string" && !(body instanceof URLSearchParams)
    && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
    requestOptions.body = JSON.stringify(body);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }

  const send = (token, forceToken = false) => {
    const requestHeaders = new Headers(headers);
    if (token && (forceToken || !requestHeaders.has("Authorization"))) {
      requestHeaders.set("Authorization", `Bearer ${token}`);
    }
    return fetch(joinApiUrl(url, baseUrl), { ...requestOptions, headers: requestHeaders });
  };

  const accessToken = localStorage.getItem("access_token");
  const response = await send(accessToken);
  if (response.status !== 401 || !refreshOnUnauthorized) return response;

  let refreshedToken;
  try {
    refreshedToken = await refreshAccessToken();
  } catch (error) {
    if (error?.code === "NETWORK_ERROR" || error?.code === "TIMEOUT") throw error;
    clearStoredSession();
    throw new ApiError("Your session has expired. Please log in again.", {
      status: 401,
      code: "SESSION_EXPIRED",
      response,
      cause: error,
    });
  }

  const retryResponse = await send(refreshedToken, true);
  if (retryResponse.status === 401) {
    clearStoredSession();
    throw new ApiError("Your session has expired. Please log in again.", {
      status: 401,
      code: "SESSION_EXPIRED",
      response: retryResponse,
    });
  }
  return retryResponse;
}

export async function authenticatedFetch(url, options = {}, {
  refreshOnUnauthorized = true,
  baseUrl = API_BASE_URL,
} = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...requestOptions } = options;
  const abortContext = createAbortContext(signal, timeoutMs);
  try {
    return await fetchWithAuth(url, { ...requestOptions, signal: abortContext.signal }, refreshOnUnauthorized, baseUrl);
  } catch (error) {
    if (abortContext.timedOut) {
      throw normalizeApiError(Object.assign(new Error(`Request timed out after ${timeoutMs} ms.`), { name: "TimeoutError" }));
    }
    throw normalizeApiError(error);
  } finally {
    abortContext.dispose();
  }
}

export async function apiRequest(url, options = {}, {
  refreshOnUnauthorized = true,
  baseUrl = API_BASE_URL,
} = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...requestOptions } = options;
  const abortContext = createAbortContext(signal, timeoutMs);
  let response;
  try {
    response = await fetchWithAuth(url, { ...requestOptions, signal: abortContext.signal }, refreshOnUnauthorized, baseUrl);
    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw normalizeApiError(null, { payload: data, response });
    }
    return data;
  } catch (error) {
    if (abortContext.timedOut) {
      throw normalizeApiError(Object.assign(new Error(`Request timed out after ${timeoutMs} ms.`), { name: "TimeoutError" }), { response });
    }
    throw normalizeApiError(error, { response });
  } finally {
    abortContext.dispose();
  }
}

export async function validateStoredSession() {
  const accessToken = localStorage.getItem("access_token");
  const refreshToken = localStorage.getItem("refresh_token");
  if (!accessToken && !refreshToken) return false;
  if (!refreshToken) {
    clearStoredSession();
    return false;
  }

  try {
    await refreshAccessToken();
    return true;
  } catch (error) {
    if (error?.code !== "NETWORK_ERROR" && error?.code !== "TIMEOUT") clearStoredSession();
    return false;
  }
}
