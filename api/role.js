import { allow, allowedOrigin, clean, json, userRest, verifiedUser } from "./shared.js";

function headers() { return { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "https://github.com/RalphNabh/RoleReady", "X-OpenRouter-Title": "RoleReady" }; }
function keyTerms(value = "") { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((term) => term.length > 2).slice(0, 30); }

function sourceLabel(item, company) {
  const url = item.url || ""; let host = ""; try { host = new URL(url).hostname.toLowerCase(); } catch { host = ""; } const companyKey = company.toLowerCase().replace(/[^a-z0-9]/g, ""); const hostKey = host.replace(/[^a-z0-9]/g, "");
  if (hostKey.includes(companyKey) || /careers|greenhouse|lever/.test(host)) return { label: "Official", rank: 1, why: "Official company or job source" };
  if (/hackathon|mlh\.io|devpost|university/.test(host)) return { label: "Student / sponsor signal", rank: 2, why: "Public student-program or sponsor context" };
  if (/leetcode|glassdoor|reddit|interview/.test(host)) return { label: "Publicly reported practice", rank: 4, why: "Public discussion; not a guaranteed question" };
  return { label: "Publicly reported", rank: 3, why: "Relevant public technical context" };
}

async function research(company, title) {
  if (!process.env.EXA_API_KEY) return [];
  const response = await fetch("https://api.exa.ai/search", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.EXA_API_KEY }, body: JSON.stringify({ query: `${company} ${title} engineering internship interview assessment hackathon sponsorship`, type: "auto", numResults: 10, contents: { highlights: { maxCharacters: 420 } } }) });
  if (!response.ok) return [];
  const retrievedAt = new Date().toISOString().slice(0, 10);
  return (await response.json()).results.map((item) => ({ title: clean(item.title, 180), url: clean(item.url, 1000), highlights: (item.highlights || []).map((line) => clean(line, 300)).slice(0, 2), date: clean(item.publishedDate || item.published_date || retrievedAt, 30), ...sourceLabel(item, company) })).sort((a, b) => a.rank - b.rank).slice(0, 8);
}

async function evidenceFor(token) {
  const [profileResponse, evidenceResponse] = await Promise.all([
    userRest("profiles?select=*&limit=1", token), userRest("candidate_evidence?confirmed=eq.true&select=*&order=created_at.desc", token)
  ]);
  return { profile: profileResponse.ok ? (await profileResponse.json())[0] || {} : {}, evidence: evidenceResponse.ok ? await evidenceResponse.json() : [] };
}

function fallback(job, evidence, profile) {
  const content = `${job.title} ${job.description}`.toLowerCase();
  const terms = keyTerms(`${(profile.skills || []).join(" ")} ${evidence.map((item) => item.details).join(" ")}`);
  const matches = terms.filter((term) => content.includes(term)).slice(0, 6);
  const first = evidence[0];
  const requirements = ["Core technical skills", "Project ownership", "Testing / engineering quality"];
  return { score: Math.min(92, 42 + matches.length * 8 + (evidence.length ? 10 : 0)), scoreNote: matches.length ? `Verified overlap in ${matches.slice(0, 3).join(", ")}.` : "Add confirmed evidence to calibrate fit.", strengths: matches.length ? [`Confirmed overlap: ${matches.join(", ")}.`] : [], gaps: ["Review the listing and add only real evidence for its key requirements."], recruiterLens: "Make your individual contribution and measurable outcome easy to find.", resumeBullet: first?.details || "Choose confirmed evidence before creating application materials.", proofMap: requirements.map((requirement, index) => ({ requirement, evidence: index === 0 && matches.length ? `Confirmed evidence includes ${matches.join(", ")}.` : "No direct confirmed evidence mapped yet.", status: index === 0 && matches.length ? "partial" : "gap", risk: "Expect a concrete example and your individual decision.", nextAction: index === 2 ? "Add a focused test or test plan to an existing project." : "Map one confirmed project outcome to this requirement." })) };
}

async function analysis(job, profile, evidence) {
  if (!process.env.OPENROUTER_API_KEY) return fallback(job, evidence, profile);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: headers(), body: JSON.stringify({
    model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest", temperature: 0.2, response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are RoleReady, an evidence-first career agent for technical interns/new grads. Evaluate ONLY confirmed evidence supplied. Never invent skills, metrics, education, achievements, company facts, or interview questions. Return JSON with score (0-100), scoreNote, strengths string[], gaps string[], recruiterLens, resumeBullet, proofMap array. Each Proof Map item needs requirement, evidence, status (proven|partial|gap), risk, nextAction. Map exact job requirements where possible." },
      { role: "user", content: JSON.stringify({ candidate: { targetRole: profile.target_role, skills: profile.skills, confirmedEvidence: evidence.map((item) => ({ title: item.title, details: item.details, kind: item.kind })) }, job: { title: clean(job.title, 220), company: clean(job.company, 220), location: clean(job.location, 240), description: clean(job.description, 9000) } }) }
    ]
  }) });
  if (!response.ok) return fallback(job, evidence, profile);
  try { return JSON.parse((await response.json()).choices?.[0]?.message?.content || "{}"); } catch { return fallback(job, evidence, profile); }
}

export default async function handler(req, res) {
  if (!allowedOrigin(req, res)) return json(res, 403, { error: "This origin is not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const auth = await verifiedUser(req);
  if (!auth) return json(res, 401, { error: "Sign in before analyzing a role." });
  if (!allow(`role:${auth.user.id}`, 10)) return json(res, 429, { error: "Please wait before analyzing another role." });
  const job = req.body?.job || {};
  if (!clean(job.title, 220) || !clean(job.description, 9000)) return json(res, 400, { error: "A job title and description are required." });
  try {
    const { profile, evidence } = await evidenceFor(auth.token);
    const [result, sources] = await Promise.all([analysis(job, profile, evidence), research(clean(job.company, 220), clean(job.title, 220))]);
    return json(res, 200, { analysis: result, sources, generatedAt: new Date().toISOString() });
  } catch (error) { return json(res, 502, { error: "Role analysis is temporarily unavailable." }); }
}
