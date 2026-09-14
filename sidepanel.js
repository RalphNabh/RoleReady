const app = document.querySelector("#app");
const template = document.querySelector("#job-template");
const reviewTemplate = document.querySelector("#review-template");
let context;
let confirmedJob = null;
let contextSignature = "";
const FALLBACK_PROFILE = { name: "", targetRole: "", skills: [], projects: [], experiences: [] };

const words = (text) => new Set((text || "").toLowerCase().match(/[a-z][a-z+#.-]{1,}/g) || []);
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const safeUrl = (value) => { try { const url = new URL(value); return url.protocol === "https:" ? url.href : "#"; } catch { return "#"; } };

function offlineAnalyze() {
  const proofMap = [
    { requirement: "Verified candidate evidence", evidence: "Connect your RoleReady workspace before the extension can read approved evidence.", status: "partial", risk: "A fit score without your confirmed evidence would be misleading.", nextAction: "Pair this extension in Evidence Vault, then rerun the analysis." },
    { requirement: "Role-specific proof", evidence: "This job posting is captured locally and has not been matched to your evidence.", status: "gap", risk: "Recruiters will look for a concrete project or experience relevant to the listed work.", nextAction: "Open the workspace after pairing to create a truthful Proof Map." }
  ];
  return { score: null, strengths: ["The job posting is captured and ready for a cloud-backed review."], gaps: ["Pair your workspace to see verified evidence, fit, and company intelligence."], bullet: "Connect RoleReady before generating any tailored resume language.", matched: [], proofMap, recruiterLens: "Connect your workspace before trusting a match score or application recommendation." };
}

async function analyze(job, profile = {}) {
  if (!profile.apiBaseUrl || !profile.connectionToken) return { ...offlineAnalyze(), mode: "offline", sources: [] };
  try {
    const response = await fetch(`${profile.apiBaseUrl.replace(/\/$/, "")}/api/agent`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(profile.connectionToken ? { "X-RoleReady-Extension": profile.connectionToken } : {}) }, body: JSON.stringify({ action: "analyze", job, profile })
    });
    if (!response.ok) throw new Error("Live agent unavailable");
    const { analysis, sources } = await response.json();
    return { ...analysis, bullet: analysis.resumeBullet, matched: profile.skills || [], mode: "live", sources: sources || [] };
  } catch (error) {
    console.warn("Using RoleReady offline analysis", error);
    return { ...offlineAnalyze(), mode: "offline", sources: [] };
  }
}

function jobSignature(job = {}) {
  return `${job.sourceUrl || ""}\n${job.title || ""}\n${job.company || ""}\n${job.description || ""}`;
}

function reviewJob(job) {
  const fragment = reviewTemplate.content.cloneNode(true);
  const form = fragment.querySelector("#job-review-form");
  form.elements.title.value = job.title || "";
  form.elements.company.value = job.company || "";
  form.elements.location.value = job.location || "";
  form.elements.description.value = job.description || "";
  fragment.querySelector("#capture-confidence").textContent = job.extraction === "structured JobPosting + page confirmation"
    ? "Structured JobPosting data was found. Review it before RoleReady analyzes your evidence."
    : "RoleReady captured visible page text. Edit anything that is incomplete before you continue.";
  app.replaceChildren(fragment);
  document.querySelector("#job-review-form").onsubmit = (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    confirmedJob = {
      ...job,
      title: values.get("title").trim(),
      company: values.get("company").trim(),
      location: values.get("location").trim(),
      description: values.get("description").trim()
    };
    render().catch(showRenderError);
  };
}

function showRenderError(error) {
  console.error("RoleReady panel could not render.", error);
  app.innerHTML = `<section class="empty"><span>✦</span><h1>RoleReady is ready</h1><p>Open or refresh a supported job posting, then reopen this panel.</p></section>`;
}

async function render() {
  const { currentJob, candidateProfile: profile } = context;
  const currentSignature = jobSignature(currentJob);
  if (currentSignature !== contextSignature) {
    contextSignature = currentSignature;
    confirmedJob = null;
  }
  const job = confirmedJob || currentJob;
  if (!job?.description) {
    app.innerHTML = `<section class="empty"><span>✦</span><h1>Open a job posting</h1><p>Visit LinkedIn, Greenhouse, Lever, or Simplify Jobs. RoleReady will read the role in context.</p></section>`;
    return;
  }
  if (!confirmedJob) return reviewJob(job);
  const result = await analyze(job, profile);
  const fragment = template.content.cloneNode(true);
  fragment.querySelector(".job-title").textContent = job.title;
  fragment.querySelector(".company").textContent = `${job.company}${job.location ? ` · ${job.location}` : ""}`;
  fragment.querySelectorAll(".score").forEach((el) => el.textContent = result.score == null ? "—" : `${result.score}%`);
  fragment.querySelector(".score-note").textContent = result.score == null ? "Pair to calculate a verified fit" : result.score > 70 ? "Strong application target" : "Worth a strategic look";
  const mode = fragment.querySelector("#analysis-mode");
  mode.classList.add(result.mode === "live" ? "live" : "offline");
  mode.textContent = result.mode === "live"
    ? "Live paired analysis — based on confirmed cloud evidence."
    : "Offline preview — connect your workspace to use confirmed cloud evidence and live research.";
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
  document.querySelector("#save").onclick = () => { void saveApplication(job, result, profile); };
  document.querySelector("#command-center").onclick = () => chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD", openWorkspace: true });
  document.querySelectorAll("[data-requirement]").forEach((button) => button.onclick = () => chrome.runtime.sendMessage({ type: "HIGHLIGHT_REQUIREMENT", requirement: button.dataset.requirement }));
}

async function saveApplication(job, result, profile) {
  const button = document.querySelector("#save");
  if (result.mode !== "live" || !profile.connectionToken) {
    button.textContent = "Connect workspace to save";
    document.querySelector("#analysis-mode").textContent = "Pair this extension in Evidence Vault, then save a cloud-backed role workspace.";
    return;
  }
  button.disabled = true; button.textContent = "Saving to RoleReady…";
  try {
    const response = await fetch(`${profile.apiBaseUrl.replace(/\/$/, "")}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-RoleReady-Extension": profile.connectionToken },
      body: JSON.stringify({ action: "save-role", job, analysis: result, sources: result.sources || [] })
    });
    const payload = await response.json();
    if (!response.ok || !payload.saved?.id) throw new Error(payload.error || "Cloud save did not complete.");
    chrome.runtime.sendMessage({ type: "SAVE_CLOUD_APPLICATION", jobId: payload.saved.id, apiBaseUrl: profile.apiBaseUrl });
    button.textContent = "✓ Saved — open workspace";
    button.disabled = false;
    button.onclick = () => chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD", jobId: payload.saved.id, apiBaseUrl: profile.apiBaseUrl });
  } catch (error) {
    console.warn("RoleReady cloud save failed", error);
    button.disabled = false; button.textContent = "Try saving again";
    document.querySelector("#analysis-mode").textContent = `Could not save: ${error.message || "check your workspace connection."}`;
  }
}

document.querySelector("#settings").onclick = () => chrome.runtime.openOptionsPage();
document.querySelector("#dashboard").onclick = () => chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD", openWorkspace: true });
chrome.runtime.sendMessage({ type: "GET_CONTEXT" }, (data) => {
  if (chrome.runtime.lastError) {
    console.warn("RoleReady could not reach its background worker.", chrome.runtime.lastError.message);
    context = { candidateProfile: FALLBACK_PROFILE, currentJob: null };
  } else {
    context = { candidateProfile: data?.candidateProfile || FALLBACK_PROFILE, currentJob: data?.currentJob || null };
  }
  render().catch(showRenderError);
});
