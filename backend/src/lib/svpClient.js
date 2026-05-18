export async function svpRequest(path, { method='GET', token, body } = {}) {
  const base = process.env.SVP_BASE_URL;
  const locale = process.env.SVP_LOCALE || 'en';
  const svpOrigin = process.env.SVP_WEB_ORIGIN || 'https://svp-international.pacc.sa';
  const svpReferer = process.env.SVP_WEB_REFERER || `${svpOrigin}/`;
  const svpUserAgent =
    process.env.SVP_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

  if (!base) {
    const err = new Error('Missing required environment variable: SVP_BASE_URL');
    err.statusCode = 500;
    throw err;
  }

  const url = `${base}${path}${path.includes('?') ? '&' : '?'}locale=${encodeURIComponent(locale)}`;

  const headers = {
    'Accept': 'application/json',
    'Origin': svpOrigin,
    'Referer': svpReferer,
    'User-Agent': svpUserAgent,
  };
  if (body) headers['Content-Type'] = 'application/json;charset=UTF-8';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) {
    const err = new Error(`SVP request failed: ${res.status}`);
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }
  return data;
}
