import { allow, allowedOrigin, clean, json, userRest, verifiedUser } from "./shared.js";

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.APP_URL || "https://github.com/RalphNabh/RoleReady",
    "X-OpenRouter-Title": "RoleReady"
  };
}

function fallback(job, evidence) {
  const lead = evidence[0] || { title: "your strongest project", details: "your confirmed work" };
  const second = evidence[1] || lead;
  return {
    summary: `Early-career engineer with verified experience in ${[lead.title, second.title].filter(Boolean).join(" and ")}, focused on building thoughtful, reliable products.`,
    bulletOptions: evidence.slice(0, 4).map((item) => ({ evidenceId: item.id, title: item.title, bullet: item.details })),
    recruiterNote: `Hi — I’m interested in the ${job.title} opportunity at ${job.company}. My experience with ${lead.title} gives me a concrete foundation to contribute, and I would welcome the chance to discuss the work in more detail.`,
    companyInterest: `I am interested in ${job.company} because this ${job.title} role aligns with the technical work I have already completed and the direction I want to develop next.`,
    answers: [{ prompt: "Tell us about a relevant project.", answer: `${lead.title}: ${lead.details}` }, { prompt: "Why this role?", answer: `The role aligns with the problems and technologies I have been building toward. I would bring a learning mindset and specific, verifiable project experience.` }],
    truthNote: "Review every draft. Remove or edit anything that is not exactly true for you."
  };
}

async function loadContext(jobId, token) {
  const [jobResponse, evidenceResponse] = await Promise.all([
    userRest(`saved_jobs?id=eq.${encodeURIComponent(jobId)}&select=*&limit=1`, token),
    userRest("candidate_evidence?confirmed=eq.true&select=*&order=created_at.desc", token)
  ]);
  const jobs = jobResponse.ok ? await jobResponse.json() : [];
  const evidence = evidenceResponse.ok ? await evidenceResponse.json() : [];
  return { job: jobs[0], evidence };
}

async function generate(job, evidence) {
  if (!process.env.OPENROUTER_API_KEY) return fallback(job, evidence);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: headers(), body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest", temperature: 0.2, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You write a truthful application kit for a technical intern/new grad. You may ONLY use supplied confirmed evidence. Never invent technologies, outcomes, metrics, education, or employer facts. Keep the writing concise and specific. Return JSON with summary string, bulletOptions array of {evidenceId,title,bullet}, recruiterNote string, companyInterest string, answers array of {prompt,answer}, truthNote string. Create 2-4 bullet options and 2-3 common application answers." },
        { role: "user", content: JSON.stringify({ job: { title: job.title, company: job.company, description: clean(job.description, 7000), requirements: job.analysis?.proofMap || [] }, confirmedEvidence: evidence.map((item) => ({ id: item.id, title: item.title, details: item.details, kind: item.kind })) }) }
      ]
    })
  });
  if (!response.ok) return fallback(job, evidence);
  try { return JSON.parse((await response.json()).choices?.[0]?.message?.content || "{}"); } catch { return fallback(job, evidence); }
}

export default async function handler(req, res) {
  if (!allowedOrigin(req, res)) return json(res, 403, { error: "This origin is not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const auth = await verifiedUser(req);
  if (!auth) return json(res, 401, { error: "Sign in before creating an application kit." });
  if (!allow(`kit:${auth.user.id}`, 8)) return json(res, 429, { error: "Please wait a moment before creating another kit." });
  const jobId = clean(req.body?.jobId, 80);
  if (!jobId) return json(res, 400, { error: "Choose a saved job first." });
  const { job, evidence } = await loadContext(jobId, auth.token);
  if (!job) return json(res, 404, { error: "That saved job was not found." });
  const selected = Array.isArray(req.body?.evidenceIds) ? req.body.evidenceIds.map((id) => clean(id, 80)) : evidence.map((item) => item.id);
  const approved = evidence.filter((item) => selected.includes(item.id));
  if (!approved.length) return json(res, 400, { error: "Choose at least one confirmed item from your Evidence Vault." });
  const kit = await generate(job, approved);
  return json(res, 200, { kit, generatedAt: new Date().toISOString(), evidenceIds: approved.map((item) => item.id) });
}
