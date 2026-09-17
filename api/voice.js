import { allow, allowedOrigin, clean, json, verifiedUser } from "../lib/server.js";

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
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: headers(), body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini", temperature: 0.25, max_tokens: 900, response_format: { type: "json_object" }, messages }) });
  if (!response.ok) {
    // Log a diagnostic without ever logging the API key or candidate data.
    console.error("OpenRouter chat request failed", { status: response.status });
    if (response.status === 401 || response.status === 403) throw new Error("OpenRouter rejected the configured API key. Update OPENROUTER_API_KEY in Vercel and redeploy.");
    if (response.status === 402) throw new Error("OpenRouter has no available API credits for the interview model. Add credits or choose a funded model.");
    if (response.status === 429) throw new Error("OpenRouter is rate-limiting interview requests. Please try again in a moment.");
    throw new Error("The interview model is temporarily unavailable.");
  }
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
  if (!process.env.OPENROUTER_API_KEY) return { questions: fallbackPlan(profile, job), mode: "local_fallback" };
  try {
    const result = await chat([
      { role: "system", content: "Create exactly four fair mock-interview questions for a technical intern/new grad. Question 1: project introduction. Question 2: technical depth and tradeoff. Question 3: a Proof Map gap. Question 4: role/company motivation and candidate question. Use only supplied evidence and role information. Never claim private company knowledge or imply questions are guaranteed. Return JSON {questions: string[4]}." },
      { role: "user", content: JSON.stringify({ candidate: profile, job }) }
    ]);
    return { questions: Array.isArray(result.questions) && result.questions.length === 4 ? result.questions.map((item) => clean(item, 1200)) : fallbackPlan(profile, job), mode: "ai" };
  } catch (error) {
    console.error("Falling back to local interview plan", { message: error.message });
    return { questions: fallbackPlan(profile, job), mode: "local_fallback" };
  }
}

function localFeedback(answer = "") {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const mentionsOutcome = /\b(result|outcome|impact|improved|reduced|increased|users?|metric|percent|%|shipped)\b/i.test(answer);
  const mentionsDecision = /\b(decided|trade-?off|because|alternative|tested|validated|debugged|measured)\b/i.test(answer);
  const mentionsTechnicalDetail = /\b(api|database|query|cache|test|algorithm|complexity|async|latency|component|deploy)\b/i.test(answer);
  const strengths = [];
  const improvements = [];
  if (words.length >= 75) strengths.push("You gave enough context for an interviewer to follow your thinking."); else improvements.push("Add context: the situation, your exact responsibility, and the result.");
  if (mentionsDecision) strengths.push("You explained a decision or validation step."); else improvements.push("Name one option you considered and why you chose your approach.");
  if (mentionsOutcome) strengths.push("You connected the work to an outcome."); else improvements.push("Close with an observable result, even if it is a learning or reliability outcome.");
  if (!mentionsTechnicalDetail) improvements.push("Add one concrete technical detail so the answer demonstrates depth.");
  const score = Math.min(88, 44 + Math.min(28, Math.floor(words.length / 5)) + (mentionsDecision ? 8 : 0) + (mentionsOutcome ? 8 : 0));
  return { score, evidenceScore: mentionsOutcome ? 4 : 3, structureScore: words.length >= 75 ? 4 : 2, technicalDepthScore: mentionsTechnicalDetail ? 4 : 2, strengths, improvements };
}

function localReport(turns = []) {
  const feedback = turns.map((turn) => localFeedback(turn.answer));
  const average = feedback.length ? Math.round(feedback.reduce((sum, item) => sum + item.score, 0) / feedback.length) : 0;
  return {
    overallScore: average,
    clarity: feedback.length && feedback.every((item) => item.structureScore >= 4) ? 4 : 3,
    technicalDepth: feedback.some((item) => item.technicalDepthScore >= 4) ? 4 : 2,
    evidence: feedback.some((item) => item.evidenceScore >= 4) ? 4 : 3,
    strengths: ["You completed a full four-turn practice session.", ...feedback.flatMap((item) => item.strengths).slice(0, 2)],
    improvements: feedback.flatMap((item) => item.improvements).slice(0, 3),
    nextSteps: ["Turn one answer into a 60–90 second STAR story.", "Add a technical trade-off and an observable outcome to your strongest project example."]
  };
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
      return json(res, 200, await questionPlan(candidate, job));
    }
    if (action === "turn") {
      try {
        const feedback = await chat([
          { role: "system", content: "You are RoleReady's fair technical interview coach. Score only the supplied answer against confirmed candidate evidence and the given role. Do not penalize accent or dialect. Never claim private company knowledge. Return JSON {score: integer 0-100, evidenceScore: integer 1-5, structureScore: integer 1-5, technicalDepthScore: integer 1-5, strengths: string[], improvements: string[]}." },
          { role: "user", content: JSON.stringify({ candidate: facts(req.body?.profile), job: role(req.body?.job), question: clean(req.body?.question, 1500), answer: clean(req.body?.answer, 6500) }) }
        ]);
        return json(res, 200, { feedback, mode: "ai" });
      } catch (error) {
        console.error("Using local interview feedback", { message: error.message });
        return json(res, 200, { feedback: localFeedback(clean(req.body?.answer, 6500)), mode: "local_fallback" });
      }
    }
    if (action === "finish") {
      const turns = Array.isArray(req.body?.turns) ? req.body.turns.slice(0, 4).map((turn) => ({ question: clean(turn.question, 1200), answer: clean(turn.answer, 6500) })) : [];
      try {
        const report = await chat([
          { role: "system", content: "Create a concise, supportive final mock-interview scorecard for a technical intern/new grad. Score only supplied transcripts. Never infer facts or private company practices. Return JSON {overallScore: integer 0-100, clarity: integer 1-5, technicalDepth: integer 1-5, evidence: integer 1-5, strengths: string[], improvements: string[], nextSteps: string[]}." },
          { role: "user", content: JSON.stringify({ candidate: facts(req.body?.profile), job: role(req.body?.job), turns }) }
        ]);
        return json(res, 200, { report, mode: "ai" });
      } catch (error) {
        console.error("Using local interview scorecard", { message: error.message });
        return json(res, 200, { report: localReport(turns), mode: "local_fallback" });
      }
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
