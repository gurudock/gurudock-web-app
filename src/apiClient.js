const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "/api" : "https://testing.api.gurudock.com");

let refreshRequest = null;

function clearStoredSession() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user_name");
  localStorage.removeItem("user_email");
}

async function refreshAccessToken() {
  if (refreshRequest) return refreshRequest;

  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) throw new Error("Your session has expired. Please log in again.");

  refreshRequest = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token || !data.refresh_token) {
        throw new Error(data.detail || "Your session has expired. Please log in again.");
      }
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      return data.access_token;
    })
    .catch((error) => {
      clearStoredSession();
      throw error;
    })
    .finally(() => {
      refreshRequest = null;
    });

  return refreshRequest;
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
    window.dispatchEvent(new Event("auth-changed"));
    return true;
  } catch {
    clearStoredSession();
    window.dispatchEvent(new Event("auth-changed"));
    return false;
  }
}

export async function authenticatedFetch(url, options = {}, { refreshOnUnauthorized = true } = {}) {
  const requestOptions = { ...options };
  const headers = { ...(requestOptions.headers || {}) };
  const body = requestOptions.body;

  if (body && typeof body !== "string" && !(body instanceof URLSearchParams) && !(body instanceof FormData)) {
    requestOptions.body = JSON.stringify(body);
  }

  const send = () => fetch(url, {
    ...requestOptions,
    headers: {
      ...headers,
      ...(localStorage.getItem("access_token")
        ? { Authorization: `Bearer ${localStorage.getItem("access_token")}` }
        : {}),
    },
  });

  let response = await send();
  if (response.status !== 401 || !refreshOnUnauthorized) return response;

  const accessToken = await refreshAccessToken();
  response = await fetch(url, {
    ...requestOptions,
    headers: { ...headers, Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) {
    clearStoredSession();
    throw new Error("Your session has expired. Please log in again.");
  }
  return response;
}

export { API_BASE_URL, clearStoredSession };
