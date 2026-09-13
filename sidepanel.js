const app = document.querySelector("#app");
const template = document.querySelector("#job-template");
let context;
const FALLBACK_PROFILE = { name: "", targetRole: "", skills: [], projects: [], experiences: [] };

const words = (text) => new Set((text || "").toLowerCase().match(/[a-z][a-z+#.-]{1,}/g) || []);
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const safeUrl = (value) => { try { const url = new URL(value); return url.protocol === "https:" ? url.href : "#"; } catch { return "#"; } };

function offlineAnalyze(job, profile) {
  const pageWords = words(`${job.title} ${job.description}`);
  const skills = profile.skills || [];
  const matched = skills.filter((skill) => pageWords.has(skill.toLowerCase()));
  const seniorSignals = ["senior", "staff", "principal", "5+ years", "7+ years"];
  const isSenior = seniorSignals.some((term) => job.description.toLowerCase().includes(term));
  const score = Math.max(35, Math.min(94, 47 + matched.length * 8 + (isSenior ? -18 : 0)));
  const project = (profile.projects || [])[0];
  const strengths = [
    matched.length ? `Direct overlap: ${matched.join(", ")}.` : `Your project work is relevant to this product-building role.`,
    project ? `${project.name} gives you a concrete story about ${project.skills.join(", ")}.` : "Your experience gives you concrete delivery examples.",
    `Your target role (${profile.targetRole || "early-career engineering"}) aligns with this opportunity.`
  ];
  const gaps = [];
  if (!pageWords.has("typescript")) gaps.push("Confirm the required stack and learn any named tools before an interview.");
  if (isSenior) gaps.push("This posting signals seniority; prioritize similar intern/new-grad variants.");
  else gaps.push("Prepare one quantified impact story for each listed requirement.");
  const bullet = project
    ? `Built ${project.name}, a ${project.summary.replace(/^Built |^Created /, "").replace(/\.$/, "")}; applied ${project.skills.slice(0, 3).join(", ")} to deliver a user-focused product.`
    : "Add one truthful project bullet that mirrors the job’s most important technical requirement.";
  const proofMap = [
    ...matched.slice(0, 2).map((skill) => ({ requirement: skill, evidence: `Your saved profile lists ${skill}.`, status: "proven", risk: `Expect a concrete ${skill} example.`, nextAction: "Prepare a 60-second ownership-and-impact story." })),
    { requirement: "Role-specific evidence", evidence: "No direct proof captured from the job page yet.", status: "partial", risk: "A reviewer may ask how your past work transfers to this exact role.", nextAction: "Connect one project outcome to the company’s product or user problem." },
    { requirement: "Testing or production quality", evidence: "No testing evidence is currently saved.", status: "gap", risk: "An interviewer may probe reliability and engineering judgment.", nextAction: "Add a small tested feature to an existing project before applying." }
  ].slice(0, 4);
  return { score, strengths, gaps, bullet, matched, proofMap, recruiterLens: proofMap.find((item) => item.status !== "proven")?.risk || "Your strongest evidence is relevant; lead with concrete results." };
}

async function analyze(job, profile = {}) {
  if (!profile.apiBaseUrl) return { ...offlineAnalyze(job, profile), mode: "offline", sources: [] };
  try {
    const response = await fetch(`${profile.apiBaseUrl.replace(/\/$/, "")}/api/agent`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(profile.connectionToken ? { "X-RoleReady-Extension": profile.connectionToken } : {}) }, body: JSON.stringify({ action: "analyze", job, profile })
    });
    if (!response.ok) throw new Error("Live agent unavailable");
    const { analysis, sources } = await response.json();
    return { ...analysis, bullet: analysis.resumeBullet, matched: profile.skills || [], mode: "live", sources: sources || [] };
  } catch (error) {
    console.warn("Using RoleReady offline analysis", error);
    return { ...offlineAnalyze(job, profile), mode: "offline", sources: [] };
  }
}

async function render() {
  const { currentJob: job, candidateProfile: profile } = context;
  if (!job?.description) {
    app.innerHTML = `<section class="empty"><span>✦</span><h1>Open a job posting</h1><p>Visit LinkedIn, Greenhouse, Lever, or Simplify Jobs. RoleReady will read the role in context.</p></section>`;
    return;
  }
  const result = await analyze(job, profile);
  const fragment = template.content.cloneNode(true);
  fragment.querySelector(".job-title").textContent = job.title;
  fragment.querySelector(".company").textContent = `${job.company}${job.location ? ` · ${job.location}` : ""}`;
  fragment.querySelectorAll(".score").forEach((el) => el.textContent = `${result.score}%`);
  fragment.querySelector(".score-note").textContent = result.score > 70 ? "Strong application target" : "Worth a strategic look";
  fragment.querySelector(".strengths").innerHTML = result.strengths.map((x) => `<li>${esc(x)}</li>`).join("");
  fragment.querySelector(".gaps").innerHTML = result.gaps.map((x) => `<li>${esc(x)}</li>`).join("");
  fragment.querySelector(".recruiter-lens").textContent = result.recruiterLens || result.gaps[0];
  fragment.querySelector(".proof-map").innerHTML = (result.proofMap || []).map((item) => `<article class="proof ${item.status === "proven" || item.status === "partial" ? item.status : "gap"}"><div><b>${esc(item.requirement)}</b><span>${item.status === "proven" ? "Proven" : item.status === "partial" ? "Partial proof" : "Gap"}</span></div><p><strong>Your evidence:</strong> ${esc(item.evidence)}</p><p><strong>Likely probe:</strong> ${esc(item.risk)}</p><p class="action">→ ${esc(item.nextAction)}</p><button class="anchor-link" data-requirement="${esc(item.requirement)}">Find it on this page</button></article>`).join("");
  fragment.querySelector(".resume-bullet").textContent = result.bullet;
  if (result.sources?.length) {
    const sources = fragment.querySelector("#sources");
    sources.classList.remove("hidden");
    sources.querySelector(".source-list").innerHTML = result.sources.map((source) => `<a target="_blank" rel="noreferrer" href="${safeUrl(source.url)}"><b>${esc(source.title)}</b><span>${esc(source.label || "Publicly reported")} · ${esc(source.date || "Retrieved today")}</span><span>${esc(source.highlights?.[0] || "Open source")}</span></a>`).join("");
  }
  app.replaceChildren(fragment);
  document.querySelector("#save").onclick = () => saveApplication(job, result);
  document.querySelector("#command-center").onclick = () => chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  document.querySelectorAll("[data-requirement]").forEach((button) => button.onclick = () => chrome.runtime.sendMessage({ type: "HIGHLIGHT_REQUIREMENT", requirement: button.dataset.requirement }));
}

function saveApplication(job, result) {
  chrome.runtime.sendMessage({ type: "SAVE_APPLICATION", application: { job, result, status: "saved" } }, () => {
    document.querySelector("#save").textContent = "✓ Saved — prep plan ready";
  });
}

document.querySelector("#settings").onclick = () => chrome.runtime.openOptionsPage();
document.querySelector("#dashboard").onclick = () => chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
chrome.runtime.sendMessage({ type: "GET_CONTEXT" }, (data) => {
  if (chrome.runtime.lastError) {
    console.warn("RoleReady could not reach its background worker.", chrome.runtime.lastError.message);
    context = { candidateProfile: FALLBACK_PROFILE, currentJob: null };
  } else {
    context = { candidateProfile: data?.candidateProfile || FALLBACK_PROFILE, currentJob: data?.currentJob || null };
  }
  render().catch((error) => {
    console.error("RoleReady panel could not render.", error);
    app.innerHTML = `<section class="empty"><span>✦</span><h1>RoleReady is ready</h1><p>Open or refresh a supported job posting, then reopen this panel.</p></section>`;
  });
});
