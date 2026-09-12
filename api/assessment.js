const ALLOWED_LANGUAGES = {
  javascript: { runtime: "javascript", file: "main.js" },
  typescript: { runtime: "typescript", file: "main.ts" },
  python: { runtime: "python", file: "main.py" },
  java: { runtime: "java", file: "Main.java" },
  cpp: { runtime: "c++", file: "main.cpp" },
  csharp: { runtime: "csharp", file: "Main.cs" }
};
const attempts = new Map();

function clean(value, length) { return typeof value === "string" ? value.replace(/\0/g, "").slice(0, length) : ""; }
function json(res, status, body) { return res.status(status).json(body); }

async function verifiedUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  return response.ok ? response.json() : null;
}

function allow(userId) {
  const now = Date.now();
  const recent = (attempts.get(userId) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 8) return false;
  recent.push(now); attempts.set(userId, recent); return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  try {
    const user = await verifiedUser(req);
    if (!user) return json(res, 401, { error: "Sign in with GitHub before running an assessment." });
    if (!allow(user.id)) return json(res, 429, { error: "Please wait a moment before the next run." });
    const language = clean(req.body?.language, 30);
    const code = clean(req.body?.code, 30_000);
    const selected = ALLOWED_LANGUAGES[language];
    if (!selected || !code) return json(res, 400, { error: "Choose a supported language and provide code." });
    const response = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: selected.runtime, version: "*", files: [{ name: selected.file, content: code }], run_timeout: 3000, compile_timeout: 10000 })
    });
    if (!response.ok) return json(res, 503, { error: "The assessment sandbox is busy. Please retry shortly." });
    const result = await response.json();
    const output = clean(result.run?.output || result.compile?.output || result.message || "", 8000);
    const normalized = output.replace(/\s/g, "");
    const passed = !result.compile && result.run?.code === 0 && (normalized.includes("[0,1]") || normalized.includes("0,1") || normalized.includes("0 1"));
    return json(res, 200, { passed, output: output || (passed ? "Completed." : "No output. Print your returned indices to evaluate the visible case.") });
  } catch (error) {
    console.error("assessment error", error);
    return json(res, 502, { error: "The assessment runner could not complete this request." });
  }
}
