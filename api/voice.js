const MAX_AUDIO_CHARS = 4_500_000;
const MAX_TEXT = 8000;
function clean(value, length = MAX_TEXT) { return typeof value === "string" ? value.replace(/\0/g, "").slice(0, length) : ""; }
function json(res, status, body) { return res.status(status).json(body); }
function facts(profile = {}) { return { name: clean(profile.full_name || profile.name, 120), targetRole: clean(profile.target_role || profile.targetRole, 160), skills: Array.isArray(profile.skills) ? profile.skills.map((item) => clean(item, 80)).slice(0, 30) : [], evidence: Array.isArray(profile.evidence) ? profile.evidence.map((item) => ({ title: clean(item.title, 160), details: clean(item.details, 1000), confirmed: Boolean(item.confirmed) })).slice(0, 12) : [] }; }
function role(job = {}) { return { title: clean(job.title, 180), company: clean(job.company, 180), description: clean(job.description, 7000), proofMap: Array.isArray(job.analysis?.proofMap) ? job.analysis.proofMap.slice(0, 6) : [] }; }
function headers() { return { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "https://github.com/RalphNabh/RoleReady", "X-OpenRouter-Title": "RoleReady" }; }

async function chat(messages) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Voice AI is not configured.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: headers(), body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest", temperature: 0.25, response_format: { type: "json_object" }, messages }) });
  if (!response.ok) throw new Error("The interview model is temporarily unavailable.");
  const payload = await response.json();
  return JSON.parse(payload.choices?.[0]?.message?.content || "{}");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  try {
    const action = clean(req.body?.action, 40);
    if (action === "turn") {
      const feedback = await chat([
        { role: "system", content: "You are RoleReady's fair technical interview coach. Assess only the confirmed candidate evidence and the supplied job requirements. Never invent company interview questions, private company practices, or achievements. Do not penalize accent or dialect. Return JSON: score (0-100 integer), evidenceScore (1-5 integer), structureScore (1-5 integer), strengths (string array), improvements (string array), nextQuestion (string). The next question must probe a requirement or Proof Map gap and be answerable truthfully by a technical intern/new grad." },
        { role: "user", content: JSON.stringify({ candidate: facts(req.body?.profile), job: role(req.body?.job), previousQuestion: clean(req.body?.previousQuestion, 1600), answer: clean(req.body?.answer, 6500) }) }
      ]);
      return json(res, 200, { feedback });
    }
    if (action === "transcribe") {
      if (!process.env.OPENROUTER_API_KEY) return json(res, 503, { error: "Speech transcription is not configured." });
      const data = clean(req.body?.audioBase64, MAX_AUDIO_CHARS);
      const format = clean(req.body?.format, 15) || "webm";
      if (!data) return json(res, 400, { error: "Audio is required." });
      const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", { method: "POST", headers: headers(), body: JSON.stringify({ model: process.env.OPENROUTER_STT_MODEL || "openai/gpt-4o-mini-transcribe", input_audio: { data, format } }) });
      if (!response.ok) return json(res, 503, { error: "Speech transcription is temporarily unavailable." });
      const payload = await response.json();
      return json(res, 200, { text: clean(payload.text, 7000) });
    }
    if (action === "speak") {
      if (!process.env.OPENROUTER_API_KEY) return json(res, 503, { error: "Speech synthesis is not configured." });
      const response = await fetch("https://openrouter.ai/api/v1/audio/speech", { method: "POST", headers: headers(), body: JSON.stringify({ model: process.env.OPENROUTER_TTS_MODEL || "openai/gpt-4o-mini-tts-2025-12-15", input: clean(req.body?.text, 1800), voice: "nova", response_format: "mp3" }) });
      if (!response.ok) return json(res, 503, { error: "Speech synthesis is temporarily unavailable." });
      const data = Buffer.from(await response.arrayBuffer()).toString("base64");
      return json(res, 200, { audioBase64: data, mimeType: "audio/mpeg" });
    }
    return json(res, 400, { error: "Unknown voice action." });
  } catch (error) {
    console.error("voice error", error);
    return json(res, 502, { error: error.message || "The voice agent could not complete the request." });
  }
}
