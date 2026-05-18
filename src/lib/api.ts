const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

function getBaseUrl() {
  if (SUPABASE_URL) return `${SUPABASE_URL}/functions/v1`;
  // fallback to Railway if no Supabase URL
  return "https://aci-api-production.up.railway.app";
}

const BASE = getBaseUrl();

// Session state (stored in memory + localStorage)
function getSession() {
  const accessToken = localStorage.getItem("accessToken");
  const refreshToken = localStorage.getItem("refreshToken");
  const sessionId = localStorage.getItem("sessionId");
  return { accessToken, refreshToken, sessionId };
}

function saveSession(data: { accessToken?: string; refreshToken?: string; sessionId?: string }) {
  if (data.accessToken) localStorage.setItem("accessToken", data.accessToken);
  if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
  if (data.sessionId) localStorage.setItem("sessionId", data.sessionId);
}

function clearSession() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("sessionId");
}

async function doFetch(url: string, opts: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

export async function apiAuth<T = any>(
  action: string,
  body: any
): Promise<T> {
  const { res, data } = await doFetch(`${BASE}/svp-auth${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw Object.assign(new Error(data?.message || "Request failed"), { status: res.status, data });

  // Save session tokens if returned
  if (data?.accessToken) saveSession(data);

  return data as T;
}

export async function api<T = any>(
  path: string,
  { method = "GET", body, token }: { method?: string; body?: any; token?: string } = {}
): Promise<T> {
  const session = getSession();
  let access = token || session.accessToken;

  const makeOpts = (accessToken: string | null): RequestInit => ({
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const shouldRefresh = (status: number, payload: any) => {
    const message = String(payload?.message || payload?.error || "").toLowerCase();
    return status === 401 || (status === 500 && message.includes("token expired"));
  };

  let { res, data } = await doFetch(`${BASE}/svp-proxy${path}`, makeOpts(access));

  if (shouldRefresh(res.status, data) && session.refreshToken && session.sessionId) {
    try {
      const refreshRes = await doFetch(`${BASE}/svp-auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId, refreshToken: session.refreshToken }),
      });

      if (refreshRes.res.ok && refreshRes.data?.accessToken) {
        access = refreshRes.data.accessToken;
        localStorage.setItem("accessToken", access);
        ({ res, data } = await doFetch(`${BASE}/svp-proxy${path}`, makeOpts(access)));
      } else if (refreshRes.res.status === 401) {
        clearSession();
      }
    } catch {
      // refresh failed, proceed with original error
    }
  }

  if (!res.ok) {
    const message = data?.message || data?.error || "Request failed";
    throw Object.assign(new Error(message), { status: res.status, data });
  }

  return data as T;
}

export { saveSession, clearSession, getSession };

export function getBackendUrl() {
  return BASE;
}
