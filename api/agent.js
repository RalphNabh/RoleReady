import { createHash, randomUUID } from "node:crypto";
import { adminRest } from "../lib/server.js";

const MAX_BODY_BYTES = 45_000;

function json(res, status, body) {
  res.status(status).json(body);
}

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowedOrigin = safeText(process.env.ALLOWED_EXTENSION_ORIGIN, 400).replace(/\/$/, "");
  // Do not open the extension endpoint to every installed extension. Production
  // requires the exact extension origin configured in Vercel.
  if (allowedOrigin ? origin !== allowedOrigin : origin !== "http://localhost:3000") return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-RoleReady-Extension");
  return true;
}

function safeText(value, limit = 9000) {
  return typeof value === "string" ? value.replace(/\0/g, "").slice(0, limit) : "";
}

function tokenHash(value) { return createHash("sha256").update(value).digest("hex"); }

function safeHttpsUrl(value) {
  try {
    const url = new URL(safeText(value, 1800));
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

function compactAnalysis(value = {}) {
  const statuses = new Set(["proven", "partial", "gap"]);
  const proofMap = Array.isArray(value.proofMap) ? value.proofMap.slice(0, 16).map((item) => ({
    requirement: safeText(item?.requirement, 260), evidence: safeText(item?.evidence, 900),
    status: statuses.has(item?.status) ? item.status : "gap", risk: safeText(item?.risk, 900), nextAction: safeText(item?.nextAction, 900)
  })).filter((item) => item.requirement) : [];
  return {
    score: Math.max(0, Math.min(100, Number(value.score) || 0)), scoreNote: safeText(value.scoreNote, 280),
    strengths: Array.isArray(value.strengths) ? value.strengths.map((item) => safeText(item, 400)).filter(Boolean).slice(0, 8) : [],
    gaps: Array.isArray(value.gaps) ? value.gaps.map((item) => safeText(item, 400)).filter(Boolean).slice(0, 8) : [],
    resumeBullet: safeText(value.resumeBullet || value.bullet, 900), recruiterLens: safeText(value.recruiterLens, 900), proofMap
  };
}

function compactSources(value = []) {
  return Array.isArray(value) ? value.slice(0, 8).map((item) => ({
    title: safeText(item?.title, 220), url: safeHttpsUrl(item?.url), date: safeText(item?.date, 40),
    label: safeText(item?.label, 80), why: safeText(item?.why, 500),
    highlights: Array.isArray(item?.highlights) ? item.highlights.map((highlight) => safeText(highlight, 320)).filter(Boolean).slice(0, 2) : []
  })).filter((item) => item.title && item.url) : [];
}

async function extensionUser(req) {
  const token = safeText(req.headers["x-roleready-extension"], 300);
  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const response = await adminRest(`extension_connections?token_hash=eq.${encodeURIComponent(tokenHash(token))}&select=id,user_id&limit=1`);
    const rows = response.ok ? await response.json() : [];
    return rows[0] ? { id: rows[0].id, userId: rows[0].user_id } : null;
  } catch { return null; }
}

async function saveRole(userId, job, analysis, sources) {
  const sourceUrl = safeHttpsUrl(job.sourceUrl || job.source_url);
  const title = safeText(job.title, 220); const company = safeText(job.company, 220);
  const description = safeText(job.description, 11000);
  if (!sourceUrl || !title || !company || !description) throw new Error("A title, company, HTTPS source URL, and job description are required to save a role.");
  const existingResponse = await adminRest(`saved_jobs?user_id=eq.${encodeURIComponent(userId)}&source_url=eq.${encodeURIComponent(sourceUrl)}&select=id&limit=1`);
  if (!existingResponse.ok) throw new Error("RoleReady could not check your saved roles.");
  const existing = (await existingResponse.json())[0];
  const payload = {
    title, company, location: safeText(job.location, 220), description, source_url: sourceUrl,
    source_name: safeText(job.sourceName || job.source_name || "RoleReady extension", 180),
    fetched_at: new Date().toISOString().slice(0, 10), status: "shortlisted",
    analysis: compactAnalysis(analysis), sources: compactSources(sources)
  };
  const response = existing
    ? await adminRest(`saved_jobs?id=eq.${encodeURIComponent(existing.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(payload) })
    : await adminRest("saved_jobs", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ id: randomUUID(), user_id: userId, ...payload }) });
  if (!response.ok) throw new Error("RoleReady could not save this role to your workspace.");
  const saved = (await response.json())[0];
  return { id: saved?.id || existing?.id, created: !existing };
}

async function verifiedCandidate(userId) {
  if (!userId) return null;
  const [profileResponse, evidenceResponse] = await Promise.all([
    adminRest(`profiles?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`),
    adminRest(`candidate_evidence?user_id=eq.${encodeURIComponent(userId)}&confirmed=eq.true&select=*&order=created_at.desc`)
  ]);
  const profile = profileResponse.ok ? (await profileResponse.json())[0] || {} : {};
  const evidence = evidenceResponse.ok ? await evidenceResponse.json() : [];
  return candidateFacts({ name: profile.full_name, targetRole: profile.target_role, skills: profile.skills, projects: evidence.filter((item) => item.kind === "project").map((item) => ({ name: item.title, summary: item.details, skills: [] })), experiences: evidence.filter((item) => item.kind !== "project").map((item) => `${item.title}: ${item.details}`) });
}

function candidateFacts(profile = {}) {
  return {
    name: safeText(profile.name, 100),
    targetRole: safeText(profile.targetRole, 150),
    skills: Array.isArray(profile.skills) ? profile.skills.map((x) => safeText(x, 80)).slice(0, 40) : [],
    projects: Array.isArray(profile.projects) ? profile.projects.slice(0, 8) : [],
    experiences: Array.isArray(profile.experiences) ? profile.experiences.map((x) => safeText(x, 900)).slice(0, 12) : []
  };
}

async function openRouter(messages, responseFormat) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://github.com/RalphNabh/RoleReady",
      "X-OpenRouter-Title": "RoleReady"
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest",
      temperature: 0.25,
      max_tokens: 1200,
      response_format: responseFormat,
      messages
    })
  });
  if (!response.ok) throw new Error(`OpenRouter request failed (${response.status}).`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no response.");
  return JSON.parse(content);
}

async function research(company, title) {
  if (!process.env.EXA_API_KEY) return [];
  const query = `${company} engineering culture early career recruiting internships university hackathon sponsorship recent news`;
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.EXA_API_KEY },
    body: JSON.stringify({ query, type: "auto", numResults: 4, contents: { highlights: { maxCharacters: 500 } } })
  });
  if (!response.ok) return [];
  const payload = await response.json();
  const retrievedAt = new Date().toISOString().slice(0, 10);
  return (payload.results || []).map((item) => ({ title: safeText(item.title, 180), url: safeText(item.url, 1000), highlights: (item.highlights || []).map((x) => safeText(x, 300)).slice(0, 2), date: safeText(item.publishedDate || item.published_date || retrievedAt, 30), label: "Publicly reported" }));
}

const analysisSchema = {
  type: "json_schema",
  json_schema: {
    name: "role_ready_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        scoreNote: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        gaps: { type: "array", items: { type: "string" } },
        resumeBullet: { type: "string" },
        recruiterLens: { type: "string" },
        proofMap: { type: "array", items: { type: "object", properties: { requirement: { type: "string" }, evidence: { type: "string" }, status: { type: "string", enum: ["proven", "partial", "gap"] }, risk: { type: "string" }, nextAction: { type: "string" } }, required: ["requirement", "evidence", "status", "risk", "nextAction"], additionalProperties: false } }
      },
      required: ["score", "scoreNote", "strengths", "gaps", "resumeBullet", "recruiterLens", "proofMap"],
      additionalProperties: false
    }
  }
};

export default async function handler(req, res) {
  if (req.method === "GET" && req.query?.config === "1") {
    res.setHeader("Cache-Control", "public, max-age=300");
    return json(res, 200, {
      supabaseUrl: process.env.SUPABASE_URL || "",
      // The anonymous key identifies this public client; Supabase RLS protects data.
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
      appUrl: process.env.APP_URL || ""
    });
  }
  if (!setCors(req, res)) return json(res, 403, { error: "This request origin is not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (JSON.stringify(req.body || {}).length > MAX_BODY_BYTES) return json(res, 413, { error: "Request is too large." });

  try {
    const { action, job = {}, profile = {}, analysis: submittedAnalysis = {}, sources: submittedSources = [], answer = "", previousQuestion = "" } = req.body || {};
    const connection = await extensionUser(req);
    if (!connection) return json(res, 401, { error: "Connect this extension to your RoleReady workspace before using live analysis." });
    const userId = connection.userId;
    // A key can be rotated from the app; the timestamp makes inactive connections visible.
    void adminRest(`extension_connections?id=eq.${encodeURIComponent(connection.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ last_used_at: new Date().toISOString() }) }).catch(() => {});
    const facts = await verifiedCandidate(userId);
    if (!facts) return json(res, 401, { error: "RoleReady could not load your confirmed evidence." });
    const normalizedJob = { title: safeText(job.title, 220), company: safeText(job.company, 220), description: safeText(job.description, 11000), location: safeText(job.location, 220) };
    if (!normalizedJob.title || !normalizedJob.description) return json(res, 400, { error: "A job title and description are required." });

    if (action === "analyze") {
      const analysis = await openRouter([
        { role: "system", content: "You are RoleReady, a rigorous job-search agent. Evaluate ONLY the candidate facts supplied. Never invent skills, achievements, metrics, education, or company facts. Give a calibrated fit score and constructive gaps. The resume bullet must only restate candidate evidence with clearer relevance. Build a Proof Map: map exact job requirements to evidence, explicitly label gaps, say what a recruiter or interviewer would probe, and give one concrete honest action. recruiterLens should summarize the most important concern in the first 10-second recruiter review. Return JSON matching the schema." },
        { role: "user", content: JSON.stringify({ candidateFacts: facts, job: normalizedJob }) }
      ], analysisSchema);
      const sources = await research(normalizedJob.company, normalizedJob.title);
      return json(res, 200, { analysis, sources, mode: "live" });
    }

    if (action === "save-role") {
      const saved = await saveRole(userId, job, submittedAnalysis, submittedSources);
      return json(res, 200, { saved, mode: "live" });
    }

    if (action === "interview-feedback") {
      const result = await openRouter([
        { role: "system", content: "You are a fair technical interviewer. Evaluate the candidate's spoken answer against the job and candidate facts. Do not claim private company knowledge or guaranteed questions. Return strict JSON with score integer 0-100, summary string, strengths string array, improvements string array, nextQuestion string. Do not penalize accent or dialect." },
        { role: "user", content: JSON.stringify({ candidateFacts: facts, job: normalizedJob, question: safeText(previousQuestion, 1200), answer: safeText(answer, 6000) }) }
      ], { type: "json_object" });
      return json(res, 200, { feedback: result, mode: "live" });
    }
    return json(res, 400, { error: "Unknown action." });
  } catch (error) {
    console.error("RoleReady agent error", error);
    return json(res, 502, { error: error.message || "The agent could not complete that request." });
  }
}
