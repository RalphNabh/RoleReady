const windows = new Map();

export function clean(value, limit = 4000) {
  return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, limit) : "";
}

export function json(res, status, body) {
  return res.status(status).json(body);
}

export function allowedOrigin(req, res, { extension = false } = {}) {
  const origin = req.headers.origin || "";
  const appOrigin = clean(process.env.APP_URL, 400).replace(/\/$/, "");
  const extensionOrigin = clean(process.env.ALLOWED_EXTENSION_ORIGIN, 400).replace(/\/$/, "");
  const allowed = [appOrigin, extension ? extensionOrigin : ""].filter(Boolean);
  if (!origin) return true;
  if (!allowed.includes(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return true;
}

export async function verifiedUser(req) {
  const token = clean(req.headers.authorization?.replace(/^Bearer\s+/i, ""), 6000);
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return { user, token };
}

export function allow(key, limit = 10, intervalMs = 60_000) {
  const now = Date.now();
  const recent = (windows.get(key) || []).filter((time) => now - time < intervalMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  windows.set(key, recent);
  return true;
}

export async function userRest(path, token, init = {}) {
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path.replace(/^\//, "")}`;
  return fetch(url, {
    ...init,
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });
}

export async function adminRest(path, init = {}) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase service role is not configured.");
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path.replace(/^\//, "")}`;
  return fetch(url, {
    ...init,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init.headers || {})
    }
  });
}

export function requireCron(req) {
  const provided = clean(req.headers.authorization?.replace(/^Bearer\s+/i, ""), 500);
  return Boolean(process.env.CRON_SECRET && provided && provided === process.env.CRON_SECRET);
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
