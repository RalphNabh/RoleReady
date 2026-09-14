import { allow, allowedOrigin, clean, json, safeHttpUrl, userRest, verifiedUser } from "../lib/server.js";

const SIMPLIFY_README = "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README.md";
const cache = { expiresAt: 0, roles: [] };

function stripHtml(value = "") {
  return clean(value.replace(/<br\s*\/?>(\s*)/gi, " · ").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " "), 500);
}

function linkFrom(value = "") {
  return value.match(/href="([^"]+)"/i)?.[1] || "";
}

const GENERIC_TERMS = new Set(["about", "application", "career", "company", "full", "from", "intern", "internship", "job", "listing", "open", "role", "summer", "that", "the", "this", "through", "tracker", "with", "work", "working"]);

function relevantTerms(text = "") {
  return new Set((text.toLowerCase().match(/[a-z][a-z+#.-]{2,}/g) || []).filter((term) => !GENERIC_TERMS.has(term)));
}

function evidenceFit(role, evidence = [], profile = {}) {
  const hasRequirements = Boolean(role.requirements_available);
  const roleWords = relevantTerms(`${role.title} ${hasRequirements ? role.description || "" : ""}`);
  const targetWords = relevantTerms(profile.target_role || "");
  const candidate = relevantTerms(`${(profile.skills || []).join(" ")} ${evidence.map((item) => `${item.title} ${item.details}`).join(" ")}`);
  const matches = [...candidate].filter((word) => roleWords.has(word));
  const targetMatches = [...targetWords].filter((word) => relevantTerms(role.title).has(word));
  const earlyCareer = /intern|new grad|university|student|early career/i.test(role.title) ? 12 : 0;
  const score = Math.min(96, Math.max(24, 34 + Math.min(30, matches.length * 6) + Math.min(18, targetMatches.length * 9) + earlyCareer));
  if (!hasRequirements) {
    return {
      score, rankingScore: score, displayScore: false, label: "Early relevance", matchedTerms: targetMatches.slice(0, 4),
      reason: targetMatches.length ? `Matches your target role (${targetMatches.slice(0, 2).join(", ")}); the tracker does not include enough requirements for an evidence score.` : "Early-career relevance only — open the source for a full Proof Map."
    };
  }
  return { score, rankingScore: score, displayScore: true, label: "Evidence fit", matchedTerms: matches.slice(0, 8), reason: matches.length ? `Matches verified evidence in ${matches.slice(0, 3).join(", ")}.` : "Review the Proof Map before prioritizing this role." };
}

function parseSimplify(markdown) {
  const rows = [];
  const seenUrls = new Set();
  let previousCompany = "";
  const rowPattern = /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let match;
  while ((match = rowPattern.exec(markdown)) && rows.length < 30) {
    const rawCompany = stripHtml(match[1]);
    const company = /^[↳↪⤷└]/.test(rawCompany) ? previousCompany : rawCompany;
    const title = stripHtml(match[2]);
    const location = stripHtml(match[3]);
    const applicationUrl = safeHttpUrl(linkFrom(match[4]));
    if (!company || !title || !applicationUrl || seenUrls.has(applicationUrl) || /company|role/i.test(`${company} ${title}`)) continue;
    if (!/^[↳↪⤷└]/.test(rawCompany)) previousCompany = company;
    seenUrls.add(applicationUrl);
    const publishedHint = stripHtml(match[5]);
    rows.push({
      id: `simplify-${company}-${title}-${applicationUrl}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 180),
      title,
      company,
      location,
      source_url: applicationUrl,
      source_name: "Simplify Jobs tracker",
      source_tier: "Community tracker",
      published_hint: publishedHint || "Not listed",
      fetched_at: new Date().toISOString().slice(0, 10),
      description: "Requirements are available at the linked job posting.",
      requirements_available: false,
      freshness: publishedHint ? `Listed ${publishedHint} · fetched today` : "Fetched today"
    });
  }
  return rows;
}

async function simplifyRoles() {
  if (cache.expiresAt > Date.now() && cache.roles.length) return cache.roles;
  const response = await fetch(SIMPLIFY_README, { headers: { "User-Agent": "RoleReady job discovery" } });
  if (!response.ok) throw new Error("The Simplify tracker is temporarily unavailable.");
  const roles = parseSimplify(await response.text());
  cache.roles = roles;
  cache.expiresAt = Date.now() + 6 * 60 * 60 * 1000;
  return roles;
}

function normalizeGreenhouse(job, board) {
  return {
    id: `greenhouse-${board}-${job.id}`,
    title: clean(job.title, 220), company: clean(board.replace(/[-_]/g, " "), 160),
    location: clean(job.location?.name || "Location not listed", 220), description: clean(job.content || "", 9000),
    source_url: safeHttpUrl(job.absolute_url), source_name: "Official Greenhouse listing", source_tier: "Official",
    fetched_at: new Date().toISOString().slice(0, 10), requirements_available: true, freshness: "Fetched today"
  };
}

function normalizeLever(job, site) {
  return {
    id: `lever-${site}-${job.id}`, title: clean(job.text, 220), company: clean(site.replace(/[-_]/g, " "), 160),
    location: clean(job.categories?.location || "Location not listed", 220), description: clean(job.descriptionPlain || job.description || "", 9000),
    source_url: safeHttpUrl(job.hostedUrl || job.applyUrl), source_name: "Official Lever listing", source_tier: "Official",
    fetched_at: new Date().toISOString().slice(0, 10), requirements_available: true, freshness: "Fetched today"
  };
}

async function officialAtsRoles(sourceUrl) {
  const url = new URL(sourceUrl);
  const greenMatch = url.hostname.match(/(?:job-boards\.|boards\.)greenhouse\.io$/i) ? url.pathname.split("/").filter(Boolean)[0] : "";
  const leverMatch = /(?:^|\.)lever\.co$/i.test(url.hostname) ? url.pathname.split("/").filter(Boolean)[0] : "";
  if (greenMatch) {
    const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(greenMatch)}/jobs?content=true`);
    if (!response.ok) throw new Error("The official Greenhouse board could not be read.");
    const payload = await response.json();
    return (payload.jobs || []).slice(0, 80).map((job) => normalizeGreenhouse(job, greenMatch));
  }
  if (leverMatch) {
    const response = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(leverMatch)}?mode=json`);
    if (!response.ok) throw new Error("The official Lever board could not be read.");
    const payload = await response.json();
    return (payload || []).slice(0, 80).map((job) => normalizeLever(job, leverMatch));
  }
  throw new Error("Use a public Greenhouse or Lever careers-board URL.");
}

async function candidateContext(token) {
  const [profileResponse, evidenceResponse] = await Promise.all([
    userRest("profiles?select=*&limit=1", token),
    userRest("candidate_evidence?select=*&confirmed=eq.true&order=created_at.desc", token)
  ]);
  const profile = profileResponse.ok ? (await profileResponse.json())[0] || {} : {};
  const evidence = evidenceResponse.ok ? await evidenceResponse.json() : [];
  return { profile, evidence };
}

export default async function handler(req, res) {
  if (!allowedOrigin(req, res)) return json(res, 403, { error: "This origin is not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  const auth = await verifiedUser(req);
  if (!auth) return json(res, 401, { error: "Sign in to see roles ranked for your evidence." });
  if (!allow(`jobs:${auth.user.id}`, 18)) return json(res, 429, { error: "Please wait a moment before refreshing roles." });
  try {
    const { profile, evidence } = await candidateContext(auth.token);
    let roles;
    if (req.method === "GET" || req.body?.source === "simplify") roles = await simplifyRoles();
    else if (req.method === "POST" && req.body?.sourceUrl) roles = await officialAtsRoles(safeHttpUrl(req.body.sourceUrl));
    else return json(res, 400, { error: "Choose the Simplify tracker or provide a public Greenhouse/Lever board." });
    const ranked = roles.map((role) => ({ ...role, fit: evidenceFit(role, evidence, profile) })).sort((a, b) => b.fit.score - a.fit.score);
    return json(res, 200, { roles: ranked.slice(0, 24), retrievedAt: new Date().toISOString(), source: req.method === "GET" ? "simplify" : "official-ats" });
  } catch (error) {
    return json(res, 502, { error: error.message || "Job discovery is temporarily unavailable." });
  }
}
