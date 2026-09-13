import { allow, allowedOrigin, clean, json, verifiedUser } from "./shared.js";

const MAX_AUDIO_CHARS = 4_500_000;

function facts(profile = {}) {
  return {
    name: clean(profile.full_name || profile.name, 120), targetRole: clean(profile.target_role || profile.targetRole, 160),
    skills: Array.isArray(profile.skills) ? profile.skills.map((item) => clean(item, 80)).slice(0, 30) : [],
    evidence: Array.isArray(profile.evidence) ? profile.evidence.filter((item) => item.confirmed !== false).map((item) => ({ title: clean(item.title, 160), details: clean(item.details, 1000) })).slice(0, 12) : []
  };
}

function role(job = {}) {
  return { title: clean(job.title, 180), company: clean(job.company, 180), description: clean(job.description, 6500), proofMap: Array.isArray(job.analysis?.proofMap) ? job.analysis.proofMap.slice(0, 6) : [] };
}

function headers() {
  return { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "https://github.com/RalphNabh/RoleReady", "X-OpenRouter-Title": "RoleReady" };
}

async function chat(messages) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Voice AI is not configured.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: headers(), body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest", temperature: 0.25, response_format: { type: "json_object" }, messages }) });
  if (!response.ok) throw new Error("The interview model is temporarily unavailable.");
  const payload = await response.json();
  return JSON.parse(payload.choices?.[0]?.message?.content || "{}");
}

function fallbackPlan(profile, job) {
  const project = profile.evidence?.[0]?.title || "a project you built";
  const gap = job.proofMap?.find((item) => item.status !== "proven")?.requirement || "a role requirement you are developing";
  return [
    `Thanks for joining. Tell me about ${project}. What problem did it solve, what was your individual contribution, and what outcome can you support?`,
    `Choose one technical decision from that work. What alternatives did you consider, what did you choose, and how did you validate it?`,
    `This role may probe ${gap}. How would you approach a task in that area, and what would you do when you reached the edge of your current experience?`,
    `Why does the ${job.title || "role"} at ${job.company || "this company"} fit your next step, and what thoughtful question would you ask the interviewer?`
  ];
}

async function questionPlan(profile, job) {
  if (!process.env.OPENROUTER_API_KEY) return fallbackPlan(profile, job);
  const result = await chat([
    { role: "system", content: "Create exactly four fair mock-interview questions for a technical intern/new grad. Question 1: project introduction. Question 2: technical depth and tradeoff. Question 3: a Proof Map gap. Question 4: role/company motivation and candidate question. Use only supplied evidence and role information. Never claim private company knowledge or imply questions are guaranteed. Return JSON {questions: string[4]}." },
    { role: "user", content: JSON.stringify({ candidate: profile, job }) }
  ]);
  return Array.isArray(result.questions) && result.questions.length === 4 ? result.questions.map((item) => clean(item, 1200)) : fallbackPlan(profile, job);
}

export default async function handler(req, res) {
  if (!allowedOrigin(req, res)) return json(res, 403, { error: "This origin is not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const auth = await verifiedUser(req);
  if (!auth) return json(res, 401, { error: "Sign in before starting voice practice." });
  if (!allow(`voice:${auth.user.id}`, 16)) return json(res, 429, { error: "Please wait a moment before the next voice request." });
  try {
    const action = clean(req.body?.action, 40);
    if (action === "start") {
      const candidate = facts(req.body?.profile); const job = role(req.body?.job);
      return json(res, 200, { questions: await questionPlan(candidate, job) });
    }
    if (action === "turn") {
      const feedback = await chat([
        { role: "system", content: "You are RoleReady's fair technical interview coach. Score only the supplied answer against confirmed candidate evidence and the given role. Do not penalize accent or dialect. Never claim private company knowledge. Return JSON {score: integer 0-100, evidenceScore: integer 1-5, structureScore: integer 1-5, technicalDepthScore: integer 1-5, strengths: string[], improvements: string[]}." },
        { role: "user", content: JSON.stringify({ candidate: facts(req.body?.profile), job: role(req.body?.job), question: clean(req.body?.question, 1500), answer: clean(req.body?.answer, 6500) }) }
      ]);
      return json(res, 200, { feedback });
    }
    if (action === "finish") {
      const report = await chat([
        { role: "system", content: "Create a concise, supportive final mock-interview scorecard for a technical intern/new grad. Score only supplied transcripts. Never infer facts or private company practices. Return JSON {overallScore: integer 0-100, clarity: integer 1-5, technicalDepth: integer 1-5, evidence: integer 1-5, strengths: string[], improvements: string[], nextSteps: string[]}." },
        { role: "user", content: JSON.stringify({ candidate: facts(req.body?.profile), job: role(req.body?.job), turns: Array.isArray(req.body?.turns) ? req.body.turns.slice(0, 4).map((turn) => ({ question: clean(turn.question, 1200), answer: clean(turn.answer, 6500) })) : [] }) }
      ]);
      return json(res, 200, { report });
    }
    if (action === "transcribe") {
      const data = clean(req.body?.audioBase64, MAX_AUDIO_CHARS); const format = clean(req.body?.format, 15) || "webm";
      if (!data) return json(res, 400, { error: "Audio is required." });
      const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", { method: "POST", headers: headers(), body: JSON.stringify({ model: process.env.OPENROUTER_STT_MODEL || "openai/gpt-4o-mini-transcribe", input_audio: { data, format } }) });
      if (!response.ok) return json(res, 503, { error: "Speech transcription is temporarily unavailable." });
      return json(res, 200, { text: clean((await response.json()).text, 7000) });
    }
    if (action === "speak") {
      const response = await fetch("https://openrouter.ai/api/v1/audio/speech", { method: "POST", headers: headers(), body: JSON.stringify({ model: process.env.OPENROUTER_TTS_MODEL || "openai/gpt-4o-mini-tts-2025-12-15", input: clean(req.body?.text, 1800), voice: "nova", response_format: "mp3" }) });
      if (!response.ok) return json(res, 503, { error: "Speech synthesis is temporarily unavailable." });
      return json(res, 200, { audioBase64: Buffer.from(await response.arrayBuffer()).toString("base64"), mimeType: "audio/mpeg" });
    }
    return json(res, 400, { error: "Unknown voice action." });
  } catch (error) {
    return json(res, 502, { error: error.message || "The voice agent could not complete this request." });
  }
}
