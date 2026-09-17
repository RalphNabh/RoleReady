import { CHALLENGES, recommendedChallenges } from "./shared/challenges.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Not set";
const STATUS = ["shortlisted", "preparing", "applied", "assessment", "interview", "offer", "closed"];
const statusLabel = (value) => ({ shortlisted: "Shortlisted", preparing: "Preparing", applied: "Applied", assessment: "Assessment", interview: "Interview", offer: "Offer", closed: "Closed", saved: "Shortlisted" }[value] || "Shortlisted");
const legacyStatus = (value) => value === "saved" ? "shortlisted" : value || "shortlisted";
const demoPresentation = new URLSearchParams(location.search).get("demo") === "1";

const DEMO_PROFILE = { full_name: "Alex Chen", target_role: "Software Engineering Intern", skills: ["JavaScript", "React", "Python", "SQL", "Node.js", "Git"], timezone: "America/Toronto", email_reminders: false, onboarding_completed: true, onboarding: {} };
const DEMO_EVIDENCE = [
  { id: "e-campus", kind: "project", title: "CampusConnect", details: "Built a full-stack campus-events platform used by 200+ students with React, Node.js, and SQL.", source: "User-confirmed", confirmed: true },
  { id: "e-study", kind: "project", title: "StudyBuddy", details: "Created an AI study planner that reduced weekly planning time by 35% in a 20-user pilot using Python and React.", source: "User-confirmed", confirmed: true },
  { id: "e-lab", kind: "experience", title: "Student Tech Lab", details: "Shipped React features used by 500+ students and explained data structures as a teaching assistant.", source: "User-confirmed", confirmed: true }
];
const DEMO_JOB = {
  id: "google-swe-intern-2027", title: "Software Engineering Intern, BS, Summer 2027", company: "Google", location: "Multiple locations", status: "preparing", next_date: "2026-09-25", fetched_at: "2026-09-12", source_name: "Google Careers · official listing", source_url: "https://www.google.com/about/careers/applications/jobs/results/100648618540573382-software-engineering-intern/?page=2", description: "Build impactful software as part of Google’s engineering organization. The listing asks for students pursuing a relevant bachelor’s degree and experience with a general-purpose programming language.",
  analysis: { score: 76, scoreNote: "Good fit with two proof gaps", strengths: ["Confirmed JavaScript and Python product work.", "Two quantified product stories demonstrate ownership."], gaps: ["No confirmed algorithms evidence.", "No confirmed testing artifact."], recruiterLens: "Lead with a concrete programming example; expect probes on algorithms and quality.", resumeBullet: "Built CampusConnect, a full-stack campus-events platform used by 200+ students with React, Node.js, and SQL.", proofMap: [{ requirement: "General-purpose programming", evidence: "Confirmed JavaScript and Python evidence.", status: "proven", risk: "Expect a concrete implementation walkthrough.", nextAction: "Prepare one language-specific tradeoff story." }, { requirement: "Algorithms and data structures", evidence: "No confirmed algorithms artifact is saved.", status: "gap", risk: "A technical screen may probe decomposition and complexity.", nextAction: "Complete the timed Pair Finder practice set and explain complexity." }, { requirement: "Engineering quality", evidence: "No testing or reliability artifact is confirmed.", status: "gap", risk: "Interviewers may ask how you validate work.", nextAction: "Add focused tests and a short test plan to an existing project." }] },
  sources: [{ title: "Google Careers — Software Engineering Intern, BS, Summer 2027", url: "https://www.google.com/about/careers/applications/jobs/results/100648618540573382-software-engineering-intern/?page=2", date: "2026-09-12", label: "Official", why: "Official job listing", highlights: ["Official application listing."] }]
};

let config = {};
let supabase = null;
let session = null;
let workspaceMounted = false;
let recorder;
let chunks = [];
let recognition;
let cameraStream;
let state = {
  profile: { ...DEMO_PROFILE }, evidence: [...DEMO_EVIDENCE], jobs: [DEMO_JOB], milestones: [], sprints: [], kits: [], attempts: [], connections: [], extensionConnections: [], reminderStatus: null, onboarding: { step: 1, draft: {}, repos: [], proposals: [] }, onboardingShown: false, feed: [], view: "home", selectedJobId: DEMO_JOB.id, selectedChallengeId: "pair-index", language: "javascript", code: "", interview: null, feedRequested: false
};

async function setup() {
  try { config = await fetch("/api/agent?config=1").then((response) => response.json()); } catch { config = {}; }
  if (config.supabaseUrl && config.supabaseAnonKey) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    // A shared demo should never expose or alter its viewer's real workspace.
    if (!demoPresentation) {
      ({ data: { session } } = await supabase.auth.getSession());
      supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        session = nextSession;
        if (!workspaceMounted) return;
        await hydrate(); render(); if (nextSession && !state.profile.onboarding_completed && !state.onboardingShown) queueMicrotask(openOnboarding);
      });
    }
  }
  const imported = new URLSearchParams(location.search).get("importJob");
  if (imported) { try { state.importedJob = JSON.parse(decodeURIComponent(escape(atob(imported)))); } catch { state.importedJob = null; } }
  const requestedJobId = new URLSearchParams(location.search).get("jobId");
  if (!new URLSearchParams(location.search).get("workspace") && !demoPresentation && !state.importedJob) return renderLanding();
  await hydrate(); mountWorkspace();
  if (requestedJobId && state.jobs.some((job) => job.id === requestedJobId)) {
    state.selectedJobId = requestedJobId;
    state.view = "job";
    render();
  }
  if (state.importedJob) openImportJobModal(state.importedJob);
}

function demoState() {
  state = { ...state, profile: { ...DEMO_PROFILE }, evidence: [...DEMO_EVIDENCE], jobs: [DEMO_JOB], milestones: [], sprints: [], kits: [], attempts: [], connections: [], extensionConnections: [], reminderStatus: null, selectedJobId: DEMO_JOB.id };
}

async function hydrate() {
  if (demoPresentation || !session || !supabase) return demoState();
  const queries = [
    supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
    supabase.from("candidate_evidence").select("*").order("created_at", { ascending: false }),
    supabase.from("saved_jobs").select("*").order("created_at", { ascending: false }),
    supabase.from("milestones").select("*").order("due_at", { ascending: true }),
    supabase.from("proof_sprints").select("*").order("created_at", { ascending: false }),
    supabase.from("application_kits").select("*").order("updated_at", { ascending: false }),
    supabase.from("coding_attempts").select("*").order("created_at", { ascending: false }).limit(30),
    supabase.from("profile_connections").select("*").order("updated_at", { ascending: false }),
    supabase.from("extension_connections").select("id,extension_id,created_at,last_used_at").order("created_at", { ascending: false })
  ];
  const results = await Promise.all(queries);
  const [profile, evidence, jobs, milestones, sprints, kits, attempts, connections, extensionConnections] = results.map((result) => result.data || []);
  state.profile = profile || { ...DEMO_PROFILE, onboarding_completed: false, onboarding: {}, full_name: session.user.user_metadata?.user_name || session.user.email?.split("@")[0] || "Candidate" };
  state.evidence = evidence; state.jobs = jobs.map((job) => ({ ...job, status: legacyStatus(job.status) })); state.milestones = milestones; state.sprints = sprints; state.kits = kits; state.attempts = Array.isArray(attempts) ? attempts : []; state.connections = Array.isArray(connections) ? connections : []; state.extensionConnections = Array.isArray(extensionConnections) ? extensionConnections : [];
  try { state.reminderStatus = await api("/api/reminders?status=1", undefined, { method: "GET" }); } catch { state.reminderStatus = { available: false }; }
  if (!state.jobs.some((job) => job.id === state.selectedJobId)) state.selectedJobId = state.jobs[0]?.id;
}

function mountWorkspace() {
  document.body.classList.remove("landing-mode");
  $("#app").replaceChildren($("#shell-template").content.cloneNode(true)); workspaceMounted = true;
  $$(".nav").forEach((button) => button.onclick = () => { state.view = button.dataset.view; render(); });
  $("#primary-action").onclick = () => state.view === "discover" ? openImportJobModal() : state.view === "vault" ? openEvidenceModal() : openEvidenceModal();
  $("#auth-button").onclick = auth; $("#mobile-auth-button").onclick = auth;
  render(); if (session && !state.profile.onboarding_completed && !state.onboardingShown) queueMicrotask(openOnboarding);
}

function renderLanding() {
  document.body.classList.add("landing-mode"); $("#app").replaceChildren($("#landing-template").content.cloneNode(true));
  const enter = () => location.assign(`${location.pathname}?workspace=1`);
  $("#landing-demo").onclick = () => location.assign(`${location.pathname}?demo=1`); $("#landing-demo-top").onclick = () => location.assign(`${location.pathname}?demo=1`);
  const signin = session ? enter : auth; $("#landing-signin").onclick = signin; $("#landing-signin-hero").onclick = signin;
  const modal = $("#extension-install-modal"); const close = () => { modal.hidden = true; document.body.classList.remove("extension-install-open"); };
  $$('[data-open-extension-install]').forEach((button) => button.onclick = () => { modal.hidden = false; document.body.classList.add("extension-install-open"); });
  modal.querySelector("[data-close-extension-install]").onclick = close; modal.onclick = (event) => { if (event.target === modal) close(); };
}

async function auth() {
  if (demoPresentation) return location.assign(`${location.pathname}?workspace=1`);
  if (!supabase) return window.alert("Add Supabase public keys in Vercel to enable GitHub sign-in.");
  if (session) return supabase.auth.signOut();
  await supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo: `${location.origin}?workspace=1` } });
}

function jobScore(job) { return Number(job.analysis?.score || job.fit?.score || 0); }
function selectedJob() { return state.jobs.find((job) => job.id === state.selectedJobId); }
function jobCard(job, compact = false) { const status = legacyStatus(job.status); return `<button class="job-card" data-job="${esc(job.id)}"><span class="fit">${jobScore(job)}%</span><span><b>${esc(job.title)}</b><p>${esc(job.company)} · ${esc(job.location || "Location flexible")}</p></span>${compact ? "" : `<span class="badge ${esc(status)}">${esc(statusLabel(status))}</span>`}</button>`; }
function actionButton(label, action, className = "secondary") { return `<button class="${className}" data-action="${action}">${esc(label)}</button>`; }

function nextMove() {
  const activeSprint = state.sprints.find((sprint) => sprint.status !== "complete");
  if (activeSprint) return { title: activeSprint.title, copy: activeSprint.deliverable, action: "open-sprint" };
  const job = [...state.jobs].sort((a, b) => jobScore(b) - jobScore(a))[0];
  const gap = job?.analysis?.proofMap?.find((item) => item.status !== "proven");
  if (gap) return { title: `Close: ${gap.requirement}`, copy: gap.nextAction, action: "open-best" };
  if (state.evidence.length) return { title: "Analyze a real role", copy: "Open the Chrome extension beside a listing, or discover a sourced role to turn your evidence into a Proof Map.", action: "discover" };
  return { title: "Build your Evidence Vault", copy: "Add a project, experience, resume, or public repository you can genuinely discuss.", action: "evidence" };
}

function renderHome() {
  const job = [...state.jobs].sort((a, b) => jobScore(b) - jobScore(a))[0]; const move = nextMove();
  const due = state.milestones.filter((milestone) => !milestone.completed_at).slice(0, 3);
  return `<section class="welcome-row"><div><p class="eyebrow">EVIDENCE-FIRST CAREER AGENT</p><h2>${job ? `You have a credible path to ${esc(job.company)}.` : "Build a job search around proof."}</h2><p>RoleReady keeps only confirmed evidence in your fit score, preparation plan, and application materials.</p></div><div class="quiet-stats"><span><b>${state.evidence.length}</b> confirmed facts</span><span><b>${state.jobs.length}</b> roles</span></div></section><section class="readiness-card"><div class="readiness-card-top"><div><p class="eyebrow">YOUR CAREER LOOP</p><h2>Evidence in. Better decisions out.</h2><p>Every step is tied to a saved role and one next action.</p></div><div class="readiness-ring" style="--score:${jobScore(job || {})}"><span>${jobScore(job || {})}<small>%</small></span></div></div><ol class="readiness-trail"><li class="${state.evidence.length ? "done" : "active"}"><span>1</span><b>Evidence</b></li><li class="${state.jobs.length ? "done" : ""}"><span>2</span><b>Role</b></li><li class="${state.sprints.length ? "done" : ""}"><span>3</span><b>Proof sprint</b></li><li class="${state.kits.length ? "done" : ""}"><span>4</span><b>Application kit</b></li><li class="${state.milestones.length ? "done" : ""}"><span>5</span><b>Prepare</b></li></ol><div class="next-move"><div><span class="move-icon">→</span><span><p class="eyebrow">NEXT BEST ACTION</p><b>${esc(move.title)}</b><p>${esc(move.copy)}</p></span></div>${actionButton("Open", move.action, "primary")}</div></section><section class="home-grid"><section class="surface roles-surface"><div class="section-head"><div><p class="eyebrow">BEST-FIT ROLES</p><h2>Where to focus</h2></div>${actionButton("Discover roles", "discover", "link")}</div><div class="job-list modern-list">${state.jobs.length ? [...state.jobs].sort((a, b) => jobScore(b) - jobScore(a)).slice(0, 3).map((entry) => jobCard(entry)).join("") : `<div class="empty"><strong>No roles yet</strong>Add evidence, then open the extension or discover a real role.</div>`}</div></section><section class="surface deadlines-surface"><p class="eyebrow">UP NEXT</p><h2>Deadlines that matter</h2><div class="deadline-strip">${due.length ? due.map((milestone) => `<button data-job="${esc(milestone.saved_job_id)}"><b>${shortDate(milestone.due_at)}</b><span>${esc(milestone.kind.replace("_", " "))}<small>${esc(state.jobs.find((job) => job.id === milestone.saved_job_id)?.company || "RoleReady")}</small></span></button>`).join("") : `<p>No deadlines yet. Add an application, assessment, interview, or follow-up date inside a role.</p>`}</div><div class="truth-note"><b>Truth check</b><span>Unsupported experience stays a gap until you create and confirm real proof.</span></div></section></section>`;
}

function renderDiscover() {
  const roles = state.feed.length ? state.feed : (session ? [] : [DEMO_JOB]);
  const companies = [...new Map(roles.filter((role) => (role.fit?.rankingScore || role.fit?.score || jobScore(role)) >= 60).map((role) => [role.company, role])).values()].slice(0, 4);
  return `<section class="notice"><p class="eyebrow">SOURCED DISCOVERY</p><h3>Real roles, with visible provenance.</h3><p>RoleReady ranks the public Simplify Jobs tracker against approved evidence when the source contains requirements. Tracker entries without requirements are labeled as relevance only. Track a company’s public Greenhouse or Lever board when you want official openings.</p></section><section class="card"><div class="section-head"><div><p class="eyebrow">OPPORTUNITY FEED</p><h2>Roles worth inspecting</h2></div><div class="inline-actions">${actionButton("Refresh roles", "refresh-feed")}${actionButton("Track ATS board", "track-ats")}${actionButton("Import job", "import", "primary")}</div></div>${state.feedLoading ? `<div class="empty"><strong>Refreshing sourced roles…</strong>Reading the public tracker and ranking against confirmed evidence.</div>` : roles.length ? `<div class="table">${roles.map((role) => `<div class="table-row"><div><b>${esc(role.title)}</b><small>${esc(role.company)} · ${esc(role.location || "Location not listed")}</small></div><div><small>${esc(role.source_name || "Public source")}</small><b>${esc(role.freshness || role.fetched_at || "Retrieved today")}</b></div><div><small>${esc(role.fit?.label || "Evidence fit")}</small><b>${role.fit?.displayScore === false ? "Open role" : `${role.fit?.score || jobScore(role)}%`}</b></div><button class="secondary" data-feed="${esc(role.id)}">Inspect</button></div>`).join("")}</div>` : `<div class="empty"><strong>Load current internship roles</strong><p>Sign in, then refresh the Simplify Jobs tracker. Your rank is based on confirmed evidence—not keywords you cannot support.</p>${actionButton("Load sourced roles", "refresh-feed", "primary")}</div>`}</section>${companies.length ? `<section class="surface company-shortlist"><p class="eyebrow">COMPANIES WORTH YOUR ATTENTION</p><div class="company-cards">${companies.map((role) => `<button data-feed="${esc(role.id)}"><b>${esc(role.company)}</b><span>${esc(role.fit?.reason || "Strong evidence fit")}</span></button>`).join("")}</div></section>` : ""}`;
}

function calendarGrid() {
  const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); const offset = (first.getDay() + 6) % 7;
  const tagged = new Set(state.milestones.filter((milestone) => !milestone.completed_at).map((milestone) => String(milestone.due_at).slice(0, 10)));
  const parts = ["M", "T", "W", "T", "F", "S", "S"].map((day) => `<span>${day}</span>`); for (let index = 0; index < offset; index++) parts.push("<i class=\"blank\"></i>"); for (let day = 1; day <= days; day++) { const date = new Date(now.getFullYear(), now.getMonth(), day).toISOString().slice(0, 10); parts.push(`<i class="${tagged.has(date) ? "has-milestone" : ""}">${day}</i>`); } return parts.join("");
}

function renderPipeline() {
  const columns = STATUS.filter((status) => status !== "closed").map((status) => `<div class="column"><h3>${statusLabel(status)} <span>(${state.jobs.filter((job) => legacyStatus(job.status) === status).length})</span></h3>${state.jobs.filter((job) => legacyStatus(job.status) === status).map((job) => jobCard(job, true)).join("") || "<p>Nothing here yet.</p>"}</div>`).join("");
  const upcoming = state.milestones.filter((milestone) => !milestone.completed_at).slice(0, 10);
  const closed = state.jobs.filter((job) => legacyStatus(job.status) === "closed");
  return `<section class="card"><div class="section-head"><div><p class="eyebrow">APPLICATION PIPELINE</p><h2>Every role, in one place</h2></div>${actionButton("Add milestone", "milestone", "secondary")}</div><div class="kanban">${columns}</div>${closed.length ? `<details class="closed-roles"><summary>Closed roles (${closed.length})</summary><div class="job-list">${closed.map((job) => jobCard(job, true)).join("")}</div></details>` : ""}</section><section class="grid-2" style="margin-top:17px"><div class="card"><p class="eyebrow">REAL CAREER CALENDAR</p><h2>${new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><div class="calendar">${calendarGrid()}</div></div><div class="card"><p class="eyebrow">SCHEDULED</p><h2>Deadlines and follow-ups</h2><div class="timeline">${upcoming.length ? upcoming.map((milestone) => `<article class="timeline-row"><button class="timeline-item" data-job="${esc(milestone.saved_job_id)}"><b>${shortDate(milestone.due_at)}</b><span>${esc(milestone.kind.replace("_", " "))}<small>${esc(state.jobs.find((job) => job.id === milestone.saved_job_id)?.company || "Saved role")} · ${esc(milestone.note || "No note")}</small></span></button><div class="timeline-actions"><button class="mini-control" data-milestone-complete="${esc(milestone.id)}" title="Mark complete" aria-label="Mark ${esc(milestone.kind)} complete">✓</button><button class="mini-control danger-control" data-milestone-delete="${esc(milestone.id)}" title="Delete milestone" aria-label="Delete ${esc(milestone.kind)}">×</button></div></article>`).join("") : "<p>No milestones scheduled yet.</p>"}</div></div></section>`;
}

function renderVault() {
  const items = state.evidence.filter((item) => item.confirmed);
  const github = connectionFor("github");
  const resume = connectionFor("resume");
  const linkedInExport = connectionFor("linkedin_export");
  const linkedIn = connectionFor("linkedin_reference");
  const importedFile = resume || linkedInExport;
  const sourceState = (connection, label, copy, action, primary = false) => `<article class="source-connection ${connection ? "connected" : ""}"><div><span class="source-icon">${connection ? "✓" : "＋"}</span><div><b>${label}</b><small>${connection ? `${connection.external_id || "Connected"} · last synced ${shortDate(connection.last_synced_at)}` : copy}</small></div></div>${actionButton(connection ? (action === "refresh-github" ? "Refresh" : "Update") : "Connect", action, primary ? "primary" : "secondary")}</article>`;
  const extensionConnections = state.extensionConnections || [];
  const extensionCard = `<section class="surface extension-connections"><div class="section-head"><div><p class="eyebrow">PAIRED EXTENSION</p><h2>Chrome connections</h2></div>${actionButton("Add connection", "extension-key", "secondary")}</div><p class="source-disclaimer">A connection can read only your approved evidence. Revoke it if you change browsers or lose a device.</p>${extensionConnections.length ? `<div class="extension-connection-list">${extensionConnections.map((connection) => `<article><div><b>${esc(connection.extension_id === "chrome-web-store-pending" ? "RoleReady Chrome extension" : connection.extension_id)}</b><small>Created ${shortDate(connection.created_at)} · ${connection.last_used_at ? `last used ${shortDate(connection.last_used_at)}` : "not used yet"}</small></div><button class="mini-control danger-control" data-extension-revoke="${esc(connection.id)}" aria-label="Revoke Chrome connection">Revoke</button></article>`).join("")}</div>` : `<div class="empty compact-empty"><strong>No Chrome connection yet</strong>Create a one-time key, then paste it in Extension Options.</div>`}</section>`;
  const remindersAvailable = state.reminderStatus?.available === true;
  const reminderCopy = remindersAvailable
    ? "Get an email three days, one day, and on the due day. Timing uses your timezone’s calendar date and RoleReady’s daily delivery run."
    : "Email delivery is not configured on this deployment yet. Add Resend, a verified sender, and CRON_SECRET before enabling it.";
  return `<section class="notice"><p class="eyebrow">TRUTH-FIRST PROFILE</p><h3>Only approved facts can shape a Proof Map.</h3><p>RoleReady keeps source material separate from evidence. Connect once, then refresh public GitHub projects or replace an export whenever your work changes.</p></section><section class="vault-grid"><div class="card"><p class="eyebrow">TARGET</p><h2>${esc(state.profile.target_role || "Your next role")}</h2><p>${esc((state.profile.skills || []).join(" · ") || "Add skills you can genuinely discuss.")}</p>${actionButton("Update my setup", "onboarding", "primary")}${actionButton("Connect Chrome", "extension-key", "link")}</div><div class="card"><div class="section-head"><div><p class="eyebrow">VERIFIED EVIDENCE</p><h2>Projects and experience</h2></div><div class="inline-actions">${actionButton("Import resume", "resume")}${actionButton("GitHub projects", "github")}${actionButton("Add evidence", "evidence", "primary")}</div></div>${items.length ? items.map((entry) => `<article class="evidence"><small>${esc(entry.kind || "evidence").toUpperCase()} · ${esc(entry.source || "User-confirmed")}</small><h3>${esc(entry.title)}</h3><p>${esc(entry.details)}</p></article>`).join("") : `<div class="empty"><strong>Your vault is empty</strong>Add confirmed work before asking RoleReady to rank a job.</div>`}</div></section><section class="surface connections-surface"><div class="section-head"><div><p class="eyebrow">CONNECTED SOURCES</p><h2>Keep your evidence current.</h2></div>${actionButton("Guided setup", "onboarding", "link")}</div>${sourceState(github, "Public GitHub", "Choose public repositories and refresh their README-based suggestions.", "refresh-github", true)}${sourceState(importedFile, resume ? "Private resume" : "LinkedIn CSV export", "Upload a private resume or LinkedIn CSV whenever it changes.", "onboarding")}${sourceState(linkedIn, "LinkedIn reference", "Save a profile link only—RoleReady never scrapes LinkedIn.", "onboarding")}</section>${extensionCard}<section class="card reminder-card"><div><p class="eyebrow">DEADLINE EMAILS</p><h2>Stay ahead without browser notifications.</h2><p>${reminderCopy}</p></div><label class="toggle"><input id="email-reminders" type="checkbox" ${state.profile.email_reminders ? "checked" : ""} ${remindersAvailable ? "" : "disabled"}><span>${remindersAvailable ? "Enable email reminders" : "Email delivery needs setup"}</span></label></section>`;
}

function sprintFor(jobId) { return state.sprints.find((sprint) => sprint.saved_job_id === jobId && sprint.status !== "complete") || state.sprints.find((sprint) => sprint.saved_job_id === jobId); }
function sourceCard(source) { return `<a class="signal" href="${esc(source.url || "#")}" target="_blank" rel="noreferrer"><b>${esc(source.title)}</b><span>${esc(source.label || "Publicly reported")} · ${esc(source.date || "Retrieved today")} · ${esc(source.why || source.highlights?.[0] || "Open source")}</span></a>`; }

function renderJob() {
  const job = selectedJob(); if (!job) return renderDiscover(); const analysis = job.analysis || {}; const sprint = sprintFor(job.id); const proofMap = analysis.proofMap || [];
  return `<section class="job-workspace-head"><div><p class="eyebrow">${esc(statusLabel(job.status).toUpperCase())} · ${jobScore(job)}% EVIDENCE FIT</p><h2>${esc(job.title)}</h2><p>${esc(job.company)} · ${esc(job.location || "Location flexible")} · <a href="${esc(job.source_url || "#")}" target="_blank" rel="noreferrer">Source</a></p></div><div class="readiness-ring large" style="--score:${jobScore(job)}"><span>${jobScore(job)}<small>%</small><em>fit</em></span></div></section><section class="job-rail"><ol class="readiness-trail"><li class="done"><span>1</span><b>Evidence</b></li><li class="done"><span>2</span><b>Proof Map</b></li><li class="${sprint ? "done" : "active"}"><span>3</span><b>Proof Sprint</b></li><li class="${state.kits.some((kit) => kit.saved_job_id === job.id) ? "done" : ""}"><span>4</span><b>Application kit</b></li><li><span>5</span><b>Practice</b></li></ol><div class="stage-fields"><label>Stage<select id="job-status">${STATUS.map((status) => `<option value="${status}" ${legacyStatus(job.status) === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></label><button class="secondary" data-action="save-stage">Save</button></div></section><section class="workspace-grid"><section class="surface proof-surface"><div class="section-head"><div><p class="eyebrow">PROOF MAP</p><h2>What is genuinely ready?</h2></div><span class="truth-badge">Evidence only</span></div><div class="proof-table">${proofMap.length ? proofMap.map((item) => `<article class="proof-row ${esc(item.status)}"><div><span class="proof-status">${esc(item.status)}</span><b>${esc(item.requirement)}</b></div><div><small>YOUR EVIDENCE</small><p>${esc(item.evidence)}</p></div><div><small>LIKELY PROBE</small><p>${esc(item.risk)}</p></div><div class="proof-next"><small>NEXT ACTION</small><p>${esc(item.nextAction)}</p></div></article>`).join("") : `<div class="empty"><strong>No Proof Map yet</strong>Analyze this role from Discover or the extension.</div>`}</div></section><aside class="workspace-side"><section class="surface recruiter-surface"><p class="eyebrow">RECRUITER LENS</p><h2>What they may question</h2><p>${esc(analysis.recruiterLens || "Analyze this role to see the first concern a recruiter could have.")}</p><div class="angle"><small>TRUTHFUL APPLICATION ANGLE</small><p>${esc(analysis.resumeBullet || "Use the Application Studio to build role-specific material from confirmed evidence.")}</p></div></section><section class="surface sprint-surface"><div class="section-head"><div><p class="eyebrow">PROOF SPRINT</p><h2>${esc(sprint?.title || "Turn the key gap into proof")}</h2></div><span>${esc(sprint?.status || "Not started")}</span></div><p>${esc(sprint?.deliverable || proofMap.find((item) => item.status !== "proven")?.nextAction || "Pick one focused artifact that strengthens your strongest story.")}</p><ul class="sprint-checklist">${(sprint?.checklist || ["Build a reviewable artifact", "Add a README or short walkthrough", "Confirm the evidence you can honestly claim"]).map((item) => `<li>${esc(typeof item === "string" ? item : item.label || "Checklist item")}</li>`).join("")}</ul>${sprint?.status === "complete" ? `<div class="locked-bullet"><small>UNLOCKED, REVIEW BEFORE USE</small><b>${esc(sprint.honest_resume_bullet || "Add a truthful bullet after you confirm the artifact in your Evidence Vault.")}</b></div>` : ""}${actionButton(sprint ? "Update sprint" : "Create Proof Sprint", "sprint")}</section><section class="surface company-surface"><p class="eyebrow">COMPANY INTELLIGENCE</p><h2>Public prep signals</h2><p class="source-disclaimer">Ranked by official and recent sources first. Public reports are practice—not private interview questions.</p>${(job.sources || []).length ? job.sources.map(sourceCard).join("") : "<p>No research yet. Re-analyze from a saved role with Exa enabled.</p>"}</section></aside><section class="surface practice-launch"><div><span class="practice-icon">⌘</span><div><p class="eyebrow">PRACTICE FOR THIS EXACT ROLE</p><h2>Do not prepare in the abstract.</h2><p>Turn this Proof Map into a role-aware assessment, interview, and controlled application kit.</p></div></div><div>${actionButton("Application Studio", "studio")}${actionButton("Coding assessment", "assessment")}${actionButton("Join interview", "interview", "primary")}</div></section></section>`;
}

function renderStudio() {
  const job = selectedJob(); if (!job) return renderDiscover(); const existing = state.kits.find((kit) => kit.saved_job_id === job.id); const kit = existing?.content || state.generatedKit;
  return `<section class="studio-head"><button class="back-link" data-action="back-job">← Job workspace</button><p class="eyebrow">APPLICATION STUDIO</p><h2>A focused resume, not a fictional one.</h2><p>Select the confirmed work you want to use for ${esc(job.company)}. You can reorder, edit, and export after reviewing each statement.</p></section><section class="studio-grid"><section class="surface"><p class="eyebrow">1 · SELECT VERIFIED EVIDENCE</p><h2>What belongs in this application?</h2><div class="evidence-picker">${state.evidence.filter((item) => item.confirmed).map((item, index) => `<label><input type="checkbox" value="${esc(item.id)}" class="kit-evidence" ${existing?.selected_evidence_ids?.includes(item.id) || (!existing && index < 3) ? "checked" : ""}><span><b>${esc(item.title)}</b><small>${esc(item.details)}</small></span></label>`).join("") || "<p>Add confirmed evidence first.</p>"}</div><label>Resume headline<input id="kit-headline" value="${esc(existing?.config?.headline || state.profile.target_role || "")}" placeholder="Software Engineering Intern"></label><label>Portfolio / GitHub link<input id="kit-portfolio" value="${esc(existing?.config?.portfolio || "")}" placeholder="https://github.com/you"></label>${actionButton("Generate truthful kit", "generate-kit", "primary")}</section><section class="surface resume-preview"><p class="eyebrow">2 · REVIEW AND CUSTOMIZE</p><div id="kit-preview">${kit ? kitPreview(kit, job) : `<div class="empty"><strong>Your role-specific draft will appear here.</strong>Generate it from selected confirmed evidence.</div>`}</div></section></section>`;
}

function kitPreview(kit, job) {
  return `<article class="resume-sheet"><h2>${esc(state.profile.full_name || "Candidate")}</h2><p class="resume-meta">${esc(state.profile.target_role || "Technical candidate")} · ${esc(job.company)} application</p><h3>Summary</h3><p contenteditable="true" role="textbox" aria-label="Application summary" class="editable-kit" data-kit-field="summary">${esc(kit.summary || "")}</p><h3>Selected experience</h3>${(kit.bulletOptions || []).map((bullet, index) => `<div class="resume-bullet"><div class="bullet-head"><b>${esc(bullet.title)}</b><span><button type="button" class="mini-control" data-kit-move="${index}" data-direction="-1" aria-label="Move ${esc(bullet.title)} up" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" class="mini-control" data-kit-move="${index}" data-direction="1" aria-label="Move ${esc(bullet.title)} down" ${index === (kit.bulletOptions.length - 1) ? "disabled" : ""}>↓</button></span></div><p contenteditable="true" role="textbox" aria-label="Resume bullet for ${esc(bullet.title)}" class="editable-kit" data-kit-bullet-id="${esc(bullet.evidenceId)}">${esc(bullet.bullet)}</p></div>`).join("")}<h3>Recruiter note</h3><p contenteditable="true" role="textbox" aria-label="Recruiter note" class="editable-kit" data-kit-field="recruiterNote">${esc(kit.recruiterNote || "")}</p><h3>Why this role</h3><p contenteditable="true" role="textbox" aria-label="Why this role" class="editable-kit" data-kit-field="companyInterest">${esc(kit.companyInterest || "")}</p><p class="kit-note">${esc(kit.truthNote || "Review every statement before sending.")}</p><div class="inline-actions">${actionButton("Save edits", "save-kit-edits", "secondary")}${actionButton("Copy recruiter note", "copy-note")}${actionButton("Print / Save PDF", "print-kit")}${actionButton("Download DOCX", "docx-kit", "primary")}</div></article>`;
}

function renderAssessment() {
  const job = selectedJob();
  const challenges = recommendedChallenges(job || {});
  const challenge = CHALLENGES[state.selectedChallengeId] || challenges[0];
  const language = state.language || "javascript";
  const code = state.code || challenge.starter[language];
  const languages = { javascript: "JavaScript", typescript: "TypeScript", python: "Python", java: "Java", cpp: "C++", csharp: "C#" };
  const attempts = state.attempts.filter((attempt) => attempt.saved_job_id === job?.id).slice(0, 4);
  const history = attempts.length ? `<section class="assessment-history"><p class="eyebrow">YOUR RECENT RUNS</p><ul>${attempts.map((attempt) => `<li><span>${attempt.passed ? "✓" : "↻"}</span><div><b>${esc(languages[attempt.language] || attempt.language)} · ${esc(CHALLENGES[attempt.challenge_id]?.title || "Practice")}</b><small>${attempt.passed ? "Passed" : "Needs another pass"} · ${shortDate(attempt.created_at)}</small></div></li>`).join("")}</ul></section>` : `<section class="assessment-history empty compact-empty"><strong>No saved runs yet</strong><p>Run a challenge to build an honest practice history for this role.</p></section>`;
  return `<section class="assessment-intro"><button class="back-link" data-action="back-job">← Job workspace</button><p class="eyebrow">ROLE-AWARE CODING ASSESSMENT</p><h2>Practice the signals this role is likely to test.</h2><p>Original challenges only. Related LeetCode links are topic practice, never a claim about an employer’s exact OA.</p></section><section class="assessment-path">${challenges.map((item, index) => `<button data-challenge="${item.id}" class="${challenge.id === item.id ? "active" : ""}"><span>${index + 1}</span><b>${esc(item.title)}</b><small>${esc(item.concept)} · ${item.minutes} min</small></button>`).join("")}</section><section class="assessment-shell"><aside class="surface"><label>Language<select id="language-select">${Object.entries(languages).map(([id, label]) => `<option value="${id}" ${id === language ? "selected" : ""}>${label}</option>`).join("")}</select></label><p class="eyebrow">${esc(challenge.concept)}</p><h2>${esc(challenge.title)}</h2><p>${esc(challenge.prompt)}</p><p class="assessment-contract">Implement the provided <code>solve</code> function. RoleReady evaluates checks on the server and never stores your raw code.</p><a class="practice-link" href="https://leetcode.com/problemset/?search=${encodeURIComponent(challenge.leetcodeQuery)}" target="_blank" rel="noreferrer">Related LeetCode topic ↗</a>${history}</aside><section class="surface"><div class="section-head"><div><p class="eyebrow">${esc(language.toUpperCase())} EDITOR</p><h2>Write your solution</h2></div>${actionButton("Run assessment", "run-code", "primary")}</div><textarea class="editor" id="code" spellcheck="false">${esc(code)}</textarea><pre class="output" id="code-output">${esc(state.assessmentOutput || "Choose a challenge, write a solution, then run the server-evaluated checks.")}</pre></section></section>`;
}

function renderInterview() {
  const job = selectedJob(); const interview = state.interview; const turn = interview?.turns?.[interview.index]; const currentQuestion = interview?.questions?.[interview.index];
  if (!interview) return `<section class="interview-welcome"><button class="back-link" data-action="back-job">← Job workspace</button><p class="eyebrow">ROLE-READY INTERVIEW MEETING</p><h2>Meet your AI interviewer.</h2><p>Four focused questions drawn from this saved role and your confirmed evidence. Audio is transient; choose later whether you want to keep the transcript and scorecard.</p><div class="meeting-preview"><div class="interviewer-avatar"><span>R</span><i></i></div><div><b>Riley · RoleReady interviewer</b><p>Voice-led, fair, and specific to ${esc(job?.company || "your role")}. No accent or dialect scoring.</p></div></div>${actionButton("Join 4-question meeting", "start-interview", "primary")}</section>`;
  const isComplete = interview.status === "complete"; return `<section class="meeting-shell"><aside class="meeting-context"><button class="back-link" data-action="back-job">← Job workspace</button><p class="eyebrow">${esc(job?.company || "ROLE READY")}</p><h2>${esc(job?.title || "Interview practice")}</h2><div class="meeting-progress">${interview.questions.map((_question, index) => `<span class="${index < interview.index || isComplete ? "done" : index === interview.index ? "active" : ""}">${index + 1}</span>`).join("")}</div><p>Question ${Math.min(interview.index + 1, 4)} of 4 · ${interview.elapsed || "00:00"}</p><label class="save-session"><input id="save-interview" type="checkbox" ${interview.consent ? "checked" : ""}> Save transcript and scorecard privately</label><p class="privacy-copy">Raw audio is never stored. Camera preview stays on this device.</p>${interview.mode === "local_fallback" ? `<p class="privacy-copy">AI coaching is temporarily unavailable. This session is using RoleReady’s local practice rubric.</p>` : ""}</aside><section class="voice-stage"><div class="meeting-top"><span class="live-dot"></span><span>ROLE-READY INTERVIEWER</span><span>${isComplete ? "COMPLETE" : "LIVE"}</span></div><div class="interviewer-avatar speaking"><span>R</span><i></i></div>${isComplete ? finalInterviewCard(interview.report) : `<p class="question-label">QUESTION ${interview.index + 1}</p><h2 class="interview-question" id="voice-question">${esc(currentQuestion)}</h2><div class="voice-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="meeting-controls"><button class="record-control" id="record-button"><span>●</span> Start answer</button><button class="secondary" id="camera-button">${cameraStream ? "Hide camera" : "Camera preview"}</button><button class="secondary" id="speak-question">Play question</button></div><video id="camera-preview" autoplay muted playsinline ${cameraStream ? "" : "hidden"}></video><p id="record-note">Use your microphone, or type a response below.</p><textarea id="typed-answer" placeholder="Type your answer instead…">${esc(turn?.answer || "")}</textarea><div class="voice-actions">${actionButton("Submit answer", "submit-answer", "primary")}</div><div class="transcript" id="transcript">${esc(turn?.answer || "Your transcript will appear here.")}</div>`}</section><aside class="coaching-panel"><p class="eyebrow">LIVE COACHING</p><h2>${isComplete ? "Your scorecard" : "Make your proof obvious."}</h2>${isComplete ? scoreSummary(interview.report) : `<p>Lead with the situation, name your individual decision, then show a measurable outcome.</p>${turn?.feedback ? turnFeedback(turn.feedback) : ""}`}</aside></section>`;
}

function turnFeedback(feedback) { return `<div class="rubric"><div><small>OVERALL</small><b>${esc(feedback.score)}/100</b></div><div><small>EVIDENCE</small><b>${esc(feedback.evidenceScore)}/5</b></div><div><small>TECHNICAL DEPTH</small><b>${esc(feedback.technicalDepthScore)}/5</b></div></div><h3>What worked</h3><p>${esc((feedback.strengths || []).join(" "))}</p><h3>Next improvement</h3><p>${esc((feedback.improvements || []).join(" "))}</p>`; }
function scoreSummary(report = {}) { return `<div class="score-grid"><div><small>OVERALL</small><b>${esc(report.overallScore || "—")}</b></div><div><small>CLARITY</small><b>${esc(report.clarity || "—")}/5</b></div><div><small>TECHNICAL</small><b>${esc(report.technicalDepth || "—")}/5</b></div><div><small>EVIDENCE</small><b>${esc(report.evidence || "—")}/5</b></div></div><h3>Keep doing</h3><p>${esc((report.strengths || []).join(" "))}</p><h3>Practice next</h3><p>${esc((report.nextSteps || report.improvements || []).join(" "))}</p>`; }
function finalInterviewCard(report = {}) { return `<div class="final-interview"><p class="question-label">INTERVIEW COMPLETE</p><h2>${esc(report.overallScore || "—")}/100</h2><p>Review the private scorecard and use the next steps in your job workspace.</p>${actionButton("Return to role", "back-job", "primary")}</div>`; }

function render() {
  if (!workspaceMounted) return; const title = { home: "Today", discover: "Discover roles", pipeline: "Calendar", vault: "Evidence vault", job: "Job workspace", studio: "Application Studio", assessment: "Coding assessment", interview: "Interview meeting" }[state.view] || "RoleReady";
  $("#header-title").textContent = title; $("#auth-status").textContent = session ? `Signed in as ${state.profile.full_name || "candidate"}` : "Demo workspace — sign in to sync"; $("#auth-button").textContent = session ? "Sign out" : "Sign in with GitHub"; $("#mobile-auth-button").textContent = session ? "Sign out" : "Sign in"; $$(".nav").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  $("#primary-action").textContent = state.view === "discover" ? "Import job" : state.view === "vault" ? "Add evidence" : "Add evidence";
  const views = { home: renderHome, discover: renderDiscover, pipeline: renderPipeline, vault: renderVault, job: renderJob, studio: renderStudio, assessment: renderAssessment, interview: renderInterview };
  $("#view").innerHTML = `<div class="mobile-desktop-note">For the Chrome extension, coding room, and live interview, continue on a desktop browser.</div>${(views[state.view] || renderHome)()}`;
  bindView();
  if (state.view === "job") {
    const sprint = sprintFor(selectedJob()?.id);
    if (sprint?.status === "complete" && !sprint.evidence_id) $$(".locked-bullet").forEach((bullet) => bullet.remove());
  }
  if (state.view === "discover" && session && !state.feedRequested && !state.feedLoading) { state.feedRequested = true; void loadFeed(); }
  if (state.view === "interview" && cameraStream) { const preview = $("#camera-preview"); if (preview) preview.srcObject = cameraStream; }
}

function bindView() {
  $$('[data-job]').forEach((button) => button.onclick = () => { state.selectedJobId = button.dataset.job; state.view = "job"; render(); });
  $$('[data-feed]').forEach((button) => button.onclick = () => inspectFeed(button.dataset.feed));
  $$('[data-action]').forEach((button) => button.onclick = () => doAction(button.dataset.action));
  $$('[data-challenge]').forEach((button) => button.onclick = () => { state.selectedChallengeId = button.dataset.challenge; state.code = ""; state.assessmentOutput = ""; render(); });
  $$('[data-kit-move]').forEach((button) => button.onclick = () => { void moveKitBullet(Number(button.dataset.kitMove), Number(button.dataset.direction)); });
  $$('[data-milestone-complete]').forEach((button) => button.onclick = () => { void completeMilestone(button.dataset.milestoneComplete); });
  $$('[data-milestone-delete]').forEach((button) => button.onclick = () => { void deleteMilestone(button.dataset.milestoneDelete); });
  $$('[data-extension-revoke]').forEach((button) => button.onclick = () => { void revokeExtensionConnection(button.dataset.extensionRevoke); });
  $("#language-select")?.addEventListener("change", (event) => { state.language = event.target.value; state.code = ""; state.assessmentOutput = ""; render(); });
  $("#email-reminders")?.addEventListener("change", (event) => updateProfile({ email_reminders: event.target.checked }));
  $("#record-button")?.addEventListener("click", recordAnswer); $("#camera-button")?.addEventListener("click", toggleCamera); $("#speak-question")?.addEventListener("click", () => speak($("#voice-question")?.textContent || "")); $("#save-interview")?.addEventListener("change", (event) => { if (state.interview) state.interview.consent = event.target.checked; });
  bindRecordControls();
}

function bindRecordControls() {
  const confirmedEvidence = state.evidence.filter((item) => item.confirmed);
  $$(".evidence").forEach((article, index) => {
    const evidence = confirmedEvidence[index]; if (!evidence) return;
    const controls = document.createElement("div"); controls.className = "record-controls";
    const edit = document.createElement("button"); edit.className = "mini-control"; edit.textContent = "Edit"; edit.onclick = () => openEditEvidenceModal(evidence.id);
    const remove = document.createElement("button"); remove.className = "mini-control danger-control"; remove.textContent = "Delete"; remove.onclick = () => { void deleteEvidence(evidence.id); };
    controls.append(edit, remove); article.append(controls);
  });
  const stage = $(".stage-fields"); const job = selectedJob();
  if (stage && job) {
    const edit = document.createElement("button"); edit.className = "secondary"; edit.textContent = "Edit role"; edit.onclick = () => openEditJobModal(job);
    const remove = document.createElement("button"); remove.className = "mini-control danger-control"; remove.textContent = "Delete"; remove.onclick = () => { void deleteJob(job.id); };
    stage.append(edit, remove);
  }
  const sprint = job ? sprintFor(job.id) : null; const sprintSurface = $(".sprint-surface");
  if (sprint && sprintSurface) {
    const remove = document.createElement("button"); remove.className = "link danger-link"; remove.textContent = "Delete sprint"; remove.onclick = () => { void deleteSprint(sprint.id); };
    sprintSurface.append(remove);
  }
}

function doAction(action) {
  const handlers = {
    evidence: openEvidenceModal, resume: openResumeImport, github: openGitHubImport, onboarding: () => openOnboarding(1),
    "refresh-github": () => { openOnboarding(2); queueMicrotask(loadOnboardingGithub); }, profile: openProfileModal,
    "extension-key": openExtensionKey, discover: () => { state.view = "discover"; render(); }, "refresh-feed": loadFeed,
    "track-ats": openAtsModal, import: () => openImportJobModal(),
    "open-best": () => { state.selectedJobId = [...state.jobs].sort((a, b) => jobScore(b) - jobScore(a))[0]?.id; state.view = "job"; render(); },
    "save-stage": saveStage, sprint: openSprintModal, "open-sprint": openSprintModal, studio: () => { state.view = "studio"; render(); },
    "generate-kit": generateKit, "save-kit-edits": saveKitEdits, "copy-note": copyRecruiterNote, "print-kit": printKit,
    "docx-kit": downloadDocx, assessment: () => { state.view = "assessment"; render(); }, "run-code": runCode,
    interview: () => { state.view = "interview"; render(); }, "start-interview": startInterview, "submit-answer": submitAnswer,
    "back-job": () => { stopCamera(); state.view = "job"; render(); }, milestone: openMilestoneModal
  };
  handlers[action]?.();
}

function tokenHeaders() { return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}; }
async function api(path, body, options = {}) { const response = await fetch(path, { method: options.method || "POST", headers: { "Content-Type": "application/json", ...tokenHeaders(), ...(options.headers || {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const contentType = response.headers.get("content-type") || ""; const data = contentType.includes("application/json") ? await response.json() : await response.blob(); if (!response.ok) throw new Error(data.error || "RoleReady could not complete that request."); return data; }

async function loadFeed(sourceUrl) {
  if (!session) { state.feed = [DEMO_JOB]; state.feedRequested = true; return render(); }
  state.feedLoading = true; render();
  try { const data = sourceUrl ? await api("/api/jobs", { sourceUrl }) : await fetch("/api/jobs", { headers: tokenHeaders() }).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload; }); state.feed = data.roles || []; } catch (error) { toast(error.message); } finally { state.feedLoading = false; render(); }
}

function openAtsModal() {
  openModal(`<form id="ats-form"><p>Paste a public Greenhouse or Lever careers-board URL. RoleReady reads only official published listings and ranks them against your confirmed evidence.</p><label>Company careers board URL<input name="url" type="url" required placeholder="https://job-boards.greenhouse.io/company"></label><div class="form-actions">${actionButton("Cancel", "close", "secondary")}<button class="primary">Load official roles</button></div></form>`, () => {
    $("[data-action=close]").onclick = closeModal;
    $("#ats-form").onsubmit = async (event) => { event.preventDefault(); const url = new FormData(event.currentTarget).get("url").trim(); closeModal(); await loadFeed(url); };
  });
}

async function inspectFeed(id) {
  let role = state.feed.find((item) => item.id === id) || (!session && id === DEMO_JOB.id ? DEMO_JOB : null); if (!role) return;
  if (session && /greenhouse|lever/.test(role.source_url || "") && !role.description?.includes("Public internship listing")) { /* already enriched */ }
  else if (session && /greenhouse|lever/.test(role.source_url || "")) {
    try { const data = await api("/api/jobs", { sourceUrl: role.source_url }); const candidate = data.roles?.find((item) => item.title === role.title) || data.roles?.[0]; if (candidate) role = { ...role, ...candidate, company: role.company }; } catch { /* Keep the sourced tracker listing if board enrichment is unavailable. */ }
  }
  openImportJobModal(role, true);
}

function openModal(html, bind, onDismiss) {
  const dismiss = () => { onDismiss?.(); closeModal(); };
  $("#modal-root").innerHTML = `<div class="modal-backdrop"><section class="modal"><header><div><p class="eyebrow">ROLE READY</p><h2>Update your workspace</h2></div><button class="close" aria-label="Close">×</button></header>${html}</section></div>`;
  $(".close").onclick = dismiss;
  $(".modal-backdrop").onclick = (event) => { if (event.target.classList.contains("modal-backdrop")) dismiss(); };
  bind?.();
}
function closeModal() { $("#modal-root").innerHTML = ""; }

function openProfileModal() { openModal(`<form id="profile-form"><label>Name<input name="name" required value="${esc(state.profile.full_name || "")}"></label><label>Target role<input name="target" required value="${esc(state.profile.target_role || "")}"></label><label>Skills, comma-separated<input name="skills" value="${esc((state.profile.skills || []).join(", "))}"></label><label>Timezone<input name="timezone" value="${esc(state.profile.timezone || "America/Toronto")}"></label><div class="form-actions">${actionButton("Cancel", "close", "secondary")}<button class="primary">Save target</button></div></form>`, () => { $("[data-action=close]").onclick = closeModal; $("#profile-form").onsubmit = async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); if (await updateProfile({ full_name: form.get("name").trim(), target_role: form.get("target").trim(), skills: form.get("skills").split(",").map((item) => item.trim()).filter(Boolean), timezone: form.get("timezone").trim() || "America/Toronto" })) closeModal(); }; }); }

async function updateProfile(changes) {
  const next = { ...state.profile, ...changes };
  if (session && supabase) {
    const { error } = await supabase.from("profiles").upsert({ id: session.user.id, ...next });
    if (error) { toast(`Profile was not saved: ${error.message}`); return false; }
    toast("Profile saved securely.");
  }
  state.profile = next;
  render();
  return true;
}

function connectionFor(provider) { return state.connections.find((connection) => connection.provider === provider); }
function evidenceIdForSource(source) { return state.evidence.find((item) => item.source === source)?.id || uid(); }
async function saveConnection(provider, { externalId = null, metadata = {}, status = "connected" } = {}) {
  if (!session || !supabase) return null;
  const prior = connectionFor(provider);
  const record = { id: prior?.id || uid(), user_id: session.user.id, provider, external_id: externalId, status, metadata, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = await supabase.from("profile_connections").upsert(record, { onConflict: "user_id,provider" });
  if (error) throw new Error(error.message);
  state.connections = [record, ...state.connections.filter((item) => item.provider !== provider)];
  return record;
}
async function refreshExtensionConnections() {
  if (!session || !supabase) return [];
  const { data, error } = await supabase.from("extension_connections").select("id,extension_id,created_at,last_used_at").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  state.extensionConnections = data || [];
  return state.extensionConnections;
}
async function revokeExtensionConnection(id) {
  if (!window.confirm("Revoke this Chrome connection? That browser will need a new one-time key before it can analyze or save roles.")) return;
  try {
    await api("/api/extension", { action: "revoke", id });
    state.extensionConnections = state.extensionConnections.filter((connection) => connection.id !== id);
    toast("Chrome connection revoked."); render();
  } catch (error) { toast(error.message); }
}
function onboardingDraft() { return state.onboarding.draft || (state.onboarding.draft = {}); }
function onboardingSteps(active) { return ["Career focus", "Public GitHub", "Resume or export", "Review evidence"].map((label, index) => `<li class="${index + 1 < active ? "done" : index + 1 === active ? "active" : ""}"><span>${index + 1 < active ? "✓" : index + 1}</span><b>${label}</b></li>`).join(""); }
function closeOnboarding({ discardPendingResume = true } = {}) { if (discardPendingResume) void discardOnboardingResume(); $("#modal-root").innerHTML = ""; state.onboardingShown = true; }
async function discardOnboardingResume() { const pending = onboardingDraft().resumeImport; if (pending?.storagePath && session && supabase) await supabase.storage.from("resume-files").remove([pending.storagePath]); delete onboardingDraft().resumeImport; delete onboardingDraft().resumeProposals; }
function openOnboarding(step = state.onboarding.step || 1) { if (!session) return auth(); state.onboardingShown = true; state.onboarding.step = step; renderOnboarding(); }
function onboardingShell(active, body) { $("#modal-root").innerHTML = `<div class="modal-backdrop onboarding-backdrop"><section class="onboarding-dialog" role="dialog" aria-modal="true" aria-label="Build your Evidence Vault"><aside><a class="onboarding-brand" href="/"><img src="assets/role-ready-mark.svg" alt=""><span>RoleReady</span></a><p class="eyebrow">YOUR EVIDENCE VAULT</p><h2>Start with the proof you can stand behind.</h2><p>Connect source material, then choose what becomes evidence. Nothing is silently added to your profile.</p><ol>${onboardingSteps(active)}</ol><small>Private by default. Raw resumes remain private; only reviewed facts shape job fit.</small></aside><main><button class="close onboarding-close" aria-label="Close setup">×</button><div class="onboarding-progress"><span>STEP ${active} OF 4</span><div><i style="width:${active * 25}%"></i></div></div>${body}</main></section></div>`; $(".onboarding-close").onclick = () => closeOnboarding(); $(".onboarding-backdrop").onclick = (event) => { if (event.target.classList.contains("onboarding-backdrop")) closeOnboarding(); }; }
function renderOnboarding() {
  const active = state.onboarding.step; const draft = onboardingDraft();
  if (active === 1) {
    onboardingShell(1, `<p class="eyebrow">CAREER FOCUS</p><h1>Let’s point your search in the right direction.</h1><p class="onboarding-copy">This guides role ranking only. You can update it at any time.</p><form id="onboarding-profile" class="onboarding-form"><label>Name<input name="name" required value="${esc(draft.name ?? state.profile.full_name ?? session.user.user_metadata?.user_name ?? "")}" placeholder="Your name"></label><label>Target role<input name="targetRole" required value="${esc(draft.targetRole ?? state.profile.target_role ?? "")}" placeholder="Software Engineering Intern"></label><div class="form-split"><label>Preferred locations<input name="locations" value="${esc(draft.locations ?? state.profile.onboarding?.locations ?? "")}" placeholder="Canada, Remote"></label><label>Graduation year<input name="graduation" inputmode="numeric" value="${esc(draft.graduation ?? state.profile.onboarding?.graduation ?? "")}" placeholder="2027"></label></div><div class="onboarding-truth"><b>✓ Truth-first</b><span>Career preferences help prioritize opportunities; they are not resume claims.</span></div><div class="form-actions"><button type="button" class="secondary" id="onboarding-later">I’ll add this later</button><button class="primary">Continue to GitHub →</button></div></form>`);
    $("#onboarding-later").onclick = () => closeOnboarding();
    $("#onboarding-profile").onsubmit = async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); Object.assign(draft, { name: form.get("name").trim(), targetRole: form.get("targetRole").trim(), locations: form.get("locations").trim(), graduation: form.get("graduation").trim() }); await updateProfile({ full_name: draft.name, target_role: draft.targetRole, onboarding: { ...state.profile.onboarding, locations: draft.locations, graduation: draft.graduation } }); state.onboarding.step = 2; renderOnboarding(); };
    return;
  }
  if (active === 2) {
    const github = connectionFor("github");
    const selected = new Set(draft.githubRepos || github?.metadata?.selectedRepos || []);
    const repos = state.onboarding.repos || [];
    const snapshots = github?.metadata?.repoSnapshots || {};
    const repoRows = repos.length ? repos.map((repo) => {
      const prior = snapshots[repo.fullName];
      const changed = Boolean(prior?.updatedAt && repo.updatedAt && prior.updatedAt !== repo.updatedAt);
      return `<label><input type="checkbox" value="${esc(repo.fullName)}" ${selected.has(repo.fullName) ? "checked" : ""}><span><b>${esc(repo.name)} ${changed ? `<em class="sync-change">Updated since review</em>` : ""}</b><small>${esc(repo.description || "No description yet")} · ${esc(repo.language || "Stack not listed")} · updated ${shortDate(repo.updatedAt)}${changed ? " · re-review required" : ""}</small></span></label>`;
    }).join("") : `<div class="onboarding-empty"><b>Public projects, not a scraped profile.</b><span>Enter the username linked to this account to choose repositories.</span></div>`;
    onboardingShell(2, `<p class="eyebrow">PUBLIC GITHUB</p><h1>Bring in projects you can actually discuss.</h1><p class="onboarding-copy">RoleReady reads public repository metadata and README text. A repository updated since your last review is flagged; pick what is relevant and approve every proposed project again before it changes your evidence.</p><div class="connection-row"><label>GitHub username<input id="onboarding-github-login" value="${esc(draft.githubLogin ?? github?.external_id ?? session.user.user_metadata?.user_name ?? "")}" placeholder="your-github-username"></label><button class="secondary" id="onboarding-load-github">${repos.length ? "Refresh" : "Find projects"}</button></div><div class="repo-select-list">${repoRows}</div><p class="connection-foot">${github?.last_synced_at ? `Last synced ${new Date(github.last_synced_at).toLocaleDateString()}. Refresh checks selected repositories against their last reviewed version.` : "No GitHub data is stored until you continue."}</p><div class="form-actions"><button class="secondary" id="onboarding-back">Back</button><button class="primary" id="onboarding-github-next" ${repos.length ? "" : "disabled"}>Review selected projects →</button></div>`);
    $("#onboarding-back").onclick = () => { state.onboarding.step = 1; renderOnboarding(); };
    $("#onboarding-load-github").onclick = loadOnboardingGithub;
    $("#onboarding-github-next").onclick = prepareGithubProposals;
    return;
  }
  if (active === 3) {
    const resume = draft.resumeImport; const linkedIn = draft.linkedinUrl ?? connectionFor("linkedin_reference")?.metadata?.url ?? "";
    onboardingShell(3, `<p class="eyebrow">RESUME OR LINKEDIN EXPORT</p><h1>Add the material that fills in the rest.</h1><p class="onboarding-copy">Upload a private resume or LinkedIn CSV export for review. A LinkedIn URL is only saved as a reference—RoleReady never scrapes it.</p><section class="intake-card"><div><b>Private resume or LinkedIn export</b><span>${resume ? `${esc(resume.fileName)} parsed — ${draft.resumeProposals?.length || 0} proposed facts waiting for review.` : "PDF, DOCX, TXT, or LinkedIn CSV. Files are not sent to the AI automatically."}</span></div><input id="onboarding-file" type="file" accept=".pdf,.docx,.txt,.csv,application/pdf"><button class="secondary" id="onboarding-read-file">${resume ? "Replace file" : "Read privately"}</button></section><section class="intake-card reference-card"><div><b>LinkedIn profile reference</b><span>Optional. We store the link for you; we do not crawl the profile.</span></div><label><input id="onboarding-linkedin" type="url" value="${esc(linkedIn)}" placeholder="https://www.linkedin.com/in/you"></label></section><div class="form-actions"><button class="secondary" id="onboarding-back">Back</button><button class="primary" id="onboarding-review">Review proposed evidence →</button></div>`);
    $("#onboarding-back").onclick = () => { state.onboarding.step = 2; renderOnboarding(); };
    $("#onboarding-read-file").onclick = readOnboardingFile;
    $("#onboarding-review").onclick = () => { draft.linkedinUrl = $("#onboarding-linkedin").value.trim(); state.onboarding.step = 4; renderOnboarding(); };
    return;
  }
  const proposals = [...(draft.githubProposals || []), ...(draft.resumeProposals || [])];
  onboardingShell(4, `<p class="eyebrow">REVIEW EVIDENCE</p><h1>Only keep what is accurate.</h1><p class="onboarding-copy">These are suggestions from sources you connected. Edit, remove, or skip anything before it becomes evidence.</p><form id="onboarding-review" class="proposal-list">${proposals.length ? proposals.map((item, index) => `<article><label class="use-proposal"><input type="checkbox" name="use-${index}" checked><span>Use this fact</span></label><label>Type<select name="kind-${index}">${["project", "experience", "education", "skill"].map((kind) => `<option value="${kind}" ${item.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}</select></label><label>Title<input name="title-${index}" value="${esc(item.title)}"></label><label>What this proves<textarea name="details-${index}">${esc(item.details)}</textarea></label><small>${esc(item.source || "Connected source")}</small></article>`).join("") : `<div class="onboarding-empty"><b>You have not selected source material yet.</b><span>You can finish now and add evidence later from the Evidence Vault.</span></div>`}<label class="review-confirm"><input type="checkbox" name="confirm" required> I confirm each selected item is accurate and I can discuss it.</label><div class="form-actions"><button type="button" class="secondary" id="onboarding-back">Back</button><button class="primary">Finish my Evidence Vault</button></div></form>`);
  $("#onboarding-back").onclick = () => { state.onboarding.step = 3; renderOnboarding(); };
  $("#onboarding-review").onsubmit = finishOnboarding;
}
async function loadOnboardingGithub() { const login = $("#onboarding-github-login").value.trim().replace(/^@/, ""); if (!login) return toast("Enter a public GitHub username first."); const button = $("#onboarding-load-github"); button.disabled = true; button.textContent = "Finding…"; try { const data = await api("/api/github", { action: "repos", login }); onboardingDraft().githubLogin = data.login; state.onboarding.repos = data.repos; renderOnboarding(); } catch (error) { toast(error.message); button.disabled = false; button.textContent = "Find projects"; } }
async function prepareGithubProposals() {
  const selected = $$(".repo-select-list input:checked").map((item) => item.value);
  if (selected.length > 6) return toast("Choose up to six projects for one review pass.");
  const draft = onboardingDraft();
  draft.githubRepos = selected;
  try {
    const previews = await Promise.all(selected.map((fullName) => api("/api/github", { action: "preview", fullName })));
    draft.githubProposals = previews.map((item) => item.proposed);
    const snapshots = Object.fromEntries((state.onboarding.repos || []).filter((repo) => selected.includes(repo.fullName)).map((repo) => [repo.fullName, { updatedAt: repo.updatedAt, description: repo.description || "", language: repo.language || "" }]));
    await saveConnection("github", { externalId: draft.githubLogin, metadata: { selectedRepos: selected, repoSnapshots: snapshots, publicOnly: true } });
    state.onboarding.step = 3;
    renderOnboarding();
  } catch (error) { toast(error.message); }
}
async function readOnboardingFile() { const file = $("#onboarding-file")?.files?.[0]; if (!file) return toast("Choose a PDF, DOCX, TXT, or LinkedIn CSV export first."); const button = $("#onboarding-read-file"); button.disabled = true; button.textContent = "Reading…"; try { await discardOnboardingResume(); const path = await uploadResume(file); const data = await api("/api/evidence", { fileName: file.name, mimeType: file.type, dataBase64: await fileBase64(file) }); Object.assign(onboardingDraft(), { resumeImport: { fileName: file.name, fileType: file.type, storagePath: path }, resumeProposals: data.proposedEvidence }); renderOnboarding(); } catch (error) { toast(error.message); button.disabled = false; button.textContent = "Read privately"; } }
async function finishOnboarding(event) { event.preventDefault(); const form = new FormData(event.currentTarget); const draft = onboardingDraft(); const proposals = [...(draft.githubProposals || []), ...(draft.resumeProposals || [])]; const approved = proposals.flatMap((proposal, index) => { const source = proposal.source || "Connected source"; return form.get(`use-${index}`) ? [{ id: evidenceIdForSource(source), user_id: session.user.id, kind: form.get(`kind-${index}`), title: form.get(`title-${index}`).trim(), details: form.get(`details-${index}`).trim(), source, confirmed: true }] : []; }); let linkedInUrl = "";
  if (draft.linkedinUrl) { try { const url = new URL(draft.linkedinUrl); if (url.protocol !== "https:") throw new Error(); linkedInUrl = url.href; } catch { return toast("Use a valid https LinkedIn URL, or leave it blank."); } }
  try { if (!await saveEvidenceBatch(approved)) return; if (draft.resumeImport) await saveEvidenceImport(draft.resumeImport, draft.resumeProposals || []);
    if (linkedInUrl) { const url = new URL(linkedInUrl); await saveConnection("linkedin_reference", { externalId: url.hostname, metadata: { url: url.href, scraped: false } }); }
    await updateProfile({ full_name: draft.name || state.profile.full_name, target_role: draft.targetRole || state.profile.target_role, onboarding: { ...state.profile.onboarding, locations: draft.locations || "", graduation: draft.graduation || "" }, onboarding_completed: true }); state.onboarding = { step: 1, draft: {}, repos: [], proposals: [] }; $("#modal-root").innerHTML = ""; state.view = "vault"; render(); toast(`${approved.length} approved fact${approved.length === 1 ? "" : "s"} added to your private Evidence Vault.`); } catch (error) { toast(error.message); }
}

function openEvidenceModal() { openModal(`<form id="evidence-form"><label>Evidence type<select name="kind"><option value="project">Project</option><option value="experience">Experience</option><option value="education">Education</option><option value="skill">Skill / certification</option></select></label><label>Title<input name="title" required placeholder="CampusConnect"></label><label>What did you personally do and what happened?<textarea name="details" required placeholder="Built… decided… outcome…"></textarea></label><label>Source link (optional)<input name="sourceUrl" type="url" placeholder="https://github.com/you/project"></label><label><input type="checkbox" name="confirm" required> I confirm this is accurate and I can discuss it.</label><div class="form-actions">${actionButton("Cancel", "close", "secondary")}<button class="primary">Save confirmed evidence</button></div></form>`, () => { $("[data-action=close]").onclick = closeModal; $("#evidence-form").onsubmit = async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const saved = await saveEvidence({ id: uid(), kind: form.get("kind"), title: form.get("title").trim(), details: form.get("details").trim(), source: form.get("sourceUrl").trim() ? `Candidate source: ${form.get("sourceUrl").trim()}` : "User-confirmed", confirmed: true }); if (!saved) return; closeModal(); state.view = "vault"; render(); }; }); }

async function saveEvidence(entry) {
  return saveEvidenceBatch([entry]);
}

async function saveEvidenceBatch(entries) {
  const normalized = entries.map((entry) => ({ ...entry, user_id: session?.user?.id || entry.user_id }));
  if (!normalized.length) return true;
  if (session && supabase) {
    const { error } = await supabase.from("candidate_evidence").upsert(normalized);
    if (error) { toast(`Evidence was not saved: ${error.message}`); return false; }
    toast(`${normalized.length} confirmed item${normalized.length === 1 ? "" : "s"} saved securely.`);
  } else toast("Saved in demo mode. Sign in to sync.");
  const ids = new Set(normalized.map((item) => item.id));
  state.evidence = [...normalized, ...state.evidence.filter((item) => !ids.has(item.id))];
  return true;
}

function openEditEvidenceModal(id) {
  const current = state.evidence.find((item) => item.id === id); if (!current) return;
  openModal(`<form id="edit-evidence-form"><label>Evidence type<select name="kind">${["project", "experience", "education", "skill"].map((kind) => `<option value="${kind}" ${current.kind === kind ? "selected" : ""}>${kind === "skill" ? "Skill / certification" : kind}</option>`).join("")}</select></label><label>Title<input name="title" required value="${esc(current.title)}"></label><label>What this proves<textarea name="details" required>${esc(current.details)}</textarea></label><p class="source-disclaimer">Source: ${esc(current.source || "User-confirmed")}</p><div class="form-actions">${actionButton("Cancel", "close", "secondary")}<button class="primary">Save evidence</button></div></form>`, () => {
    $("[data-action=close]").onclick = closeModal;
    $("#edit-evidence-form").onsubmit = async (event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const saved = await saveEvidence({ ...current, kind: form.get("kind"), title: form.get("title").trim(), details: form.get("details").trim() });
      if (!saved) return; closeModal(); render();
    };
  });
}

async function deleteEvidence(id) {
  const evidence = state.evidence.find((item) => item.id === id); if (!evidence) return;
  if (!window.confirm(`Delete “${evidence.title}” from your Evidence Vault? Existing application kits may need to be regenerated.`)) return;
  if (session && supabase) {
    const { error } = await supabase.from("candidate_evidence").delete().eq("id", id);
    if (error) return toast(`Evidence was not deleted: ${error.message}`);
  }
  state.evidence = state.evidence.filter((item) => item.id !== id);
  toast("Evidence deleted. RoleReady will no longer use it in future analysis."); render();
}

async function openResumeImport() {
  openModal(`<form id="resume-import"><p>Upload a private PDF, DOCX, TXT, or LinkedIn CSV export. RoleReady reads it deterministically, then you approve individual claims. Raw files are not sent to the AI.</p><label>Resume or export<input name="file" type="file" accept=".pdf,.docx,.txt,.csv,application/pdf"></label><div class="form-actions">${actionButton("Cancel", "close", "secondary")}<button class="primary">Read privately</button></div></form>`, () => {
    $("[data-action=close]").onclick = closeModal;
    $("#resume-import").onsubmit = async (event) => {
      event.preventDefault(); const file = new FormData(event.currentTarget).get("file");
      if (!file?.size) return toast("Choose a supported file first.");
      if (!session) return toast("Sign in to import private evidence.");
      const button = $("#resume-import button.primary"); button.disabled = true; button.textContent = "Reading…";
      try {
        const path = await uploadResume(file);
        state.pendingPrivateUpload = { storagePath: path, fileName: file.name, fileType: file.type };
        const data = await api("/api/evidence", { fileName: file.name, mimeType: file.type, dataBase64: await fileBase64(file) });
        openEvidenceReview(data.proposedEvidence, { fileName: file.name, fileType: file.type, storagePath: path });
      } catch (error) {
        await discardPendingPrivateUpload();
        toast(error.message); button.disabled = false; button.textContent = "Read privately";
      }
    };
  });
}

async function uploadResume(file) { const path = `${session.user.id}/${uid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const { error } = await supabase.storage.from("resume-files").upload(path, file, { upsert: false }); if (error) throw new Error(`Private upload failed: ${error.message}`); return path; }
function fileBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); }); }

function isLinkedInExport(importMeta = {}) { return importMeta.fileType === "text/csv" || /\.csv$/i.test(importMeta.fileName || ""); }
function importProvider(importMeta = {}) { return isLinkedInExport(importMeta) ? "linkedin_export" : "resume"; }
function importSource(importMeta = {}) { return `${isLinkedInExport(importMeta) ? "LinkedIn export" : "Resume import"}: ${importMeta.fileName}`; }
async function discardPendingPrivateUpload(importMeta = {}) {
  const pending = state.pendingPrivateUpload;
  if (!pending?.storagePath || (importMeta.storagePath && pending.storagePath !== importMeta.storagePath)) return;
  state.pendingPrivateUpload = null;
  if (session && supabase) await supabase.storage.from("resume-files").remove([pending.storagePath]);
}
async function saveEvidenceImport(importMeta, proposals) {
  if (!session || !importMeta.fileName) return true;
  const { error } = await supabase.from("evidence_imports").insert({
    id: uid(), user_id: session.user.id, storage_path: importMeta.storagePath || null,
    file_name: importMeta.fileName, file_type: importMeta.fileType || "text/plain",
    parse_status: "ready", proposed_evidence: proposals
  });
  if (error) throw new Error(`The private import record was not saved: ${error.message}`);
  await saveConnection(importProvider(importMeta), {
    externalId: importMeta.fileName,
    metadata: { storagePath: importMeta.storagePath || null, fileType: importMeta.fileType || "text/plain", parsed: true }
  });
  return true;
}

function openEvidenceReview(proposals, importMeta = {}) {
  const dismissImport = () => { void discardPendingPrivateUpload(importMeta); };
  openModal(`<form id="evidence-review"><p>Review each proposed item. Unchecked or edited items will not influence your fit score.</p><div class="proposal-list">${proposals.map((item, index) => `<article><label><input type="checkbox" name="use-${index}" checked> Use this item</label><label>Type<select name="kind-${index}">${["project", "experience", "education", "skill"].map((kind) => `<option ${item.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}</select></label><label>Title<input name="title-${index}" value="${esc(item.title)}"></label><label>Details<textarea name="details-${index}">${esc(item.details)}</textarea></label></article>`).join("")}</div><div class="form-actions">${actionButton("Cancel", "close", "secondary")}<button class="primary">Confirm selected evidence</button></div></form>`, () => {
    $("[data-action=close]").onclick = () => { dismissImport(); closeModal(); };
    $("#evidence-review").onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const selected = [];
      for (let index = 0; index < proposals.length; index++) {
        if (!form.get(`use-${index}`)) continue;
        const source = importMeta.fileName ? importSource(importMeta) : proposals[index].source || "GitHub import";
        selected.push({
          id: evidenceIdForSource(source), kind: form.get(`kind-${index}`), title: form.get(`title-${index}`).trim(),
          details: form.get(`details-${index}`).trim(), source, confirmed: true
        });
      }
      const button = $("#evidence-review button.primary"); button.disabled = true; button.textContent = "Saving…";
      try {
        if (!await saveEvidenceBatch(selected)) { button.disabled = false; button.textContent = "Confirm selected evidence"; return; }
        await saveEvidenceImport(importMeta, proposals);
        state.pendingPrivateUpload = null;
        closeModal(); state.view = "vault"; render();
        toast(`${selected.length} confirmed item${selected.length === 1 ? "" : "s"} added.`);
      } catch (error) {
        toast(error.message); button.disabled = false; button.textContent = "Confirm selected evidence";
      }
    };
  }, dismissImport);
}

function openGitHubImport() { openModal(`<section id="github-import"><p>Pick a public repository. RoleReady reads visible metadata and README text, then asks you to verify a proposed project description.</p><label>Public GitHub username<input id="github-login" value="${esc(session?.user?.user_metadata?.user_name || "")}" placeholder="your-username"></label>${actionButton("Find repositories", "load-github", "primary")}<div id="github-results"></div></section>`, () => { $("[data-action=load-github]").onclick = async () => { try { const data = await api("/api/github", { action: "repos", login: $("#github-login").value.trim() }); $("#github-results").innerHTML = `<div class="repo-list">${data.repos.map((repo) => `<button data-repo="${esc(repo.fullName)}"><b>${esc(repo.name)}</b><span>${esc(repo.description || "No repository description")} · ${esc(repo.language || "Technology not listed")}</span></button>`).join("")}</div>`; $$('[data-repo]').forEach((button) => button.onclick = async () => { try { const preview = await api("/api/github", { action: "preview", fullName: button.dataset.repo }); openEvidenceReview([preview.proposed]); } catch (error) { toast(error.message); } }); } catch (error) { toast(error.message); } }; }); }

async function openExtensionKey() { if (!session) return toast("Sign in before connecting a Chrome extension."); try { const data = await api("/api/extension", { action: "create", extensionId: "chrome-web-store-pending" }); await refreshExtensionConnections(); openModal(`<section class="connection-key"><p class="eyebrow">CONNECT CHROME</p><h2>Paste this key in Extension Options</h2><p>This extension key lets RoleReady’s live analysis read only your confirmed cloud evidence. It is displayed once. Revoke it from Evidence Vault if you change browsers or lose a device.</p><code id="extension-token">${esc(data.token)}</code><div class="form-actions">${actionButton("Copy key", "copy-extension", "primary")}${actionButton("Done", "close", "secondary")}</div></section>`, () => { $("[data-action=copy-extension]").onclick = async () => { await navigator.clipboard.writeText(data.token); toast("Connection key copied. Open Chrome extension Options and paste it."); }; $("[data-action=close]").onclick = () => { closeModal(); render(); }; }); } catch (error) { toast(error.message); } }

function openImportJobModal(imported = {}, analyze = false) { openModal(`<form id="job-import"><label>Job title<input name="title" required value="${esc(imported.title || "")}"></label><label>Company<input name="company" required value="${esc(imported.company || "")}"></label><label>Location<input name="location" value="${esc(imported.location || "")}"></label><label>Source URL<input name="url" type="url" value="${esc(imported.source_url || imported.sourceUrl || "")}"></label><label>Job description<textarea name="description" required>${esc(imported.description || "")}</textarea></label><p>RoleReady stores the source and retrieval date. Analyze this job only against confirmed evidence.</p><div class="form-actions">${actionButton("Cancel", "close", "secondary")}<button class="primary">${analyze ? "Analyze and save role" : "Save role workspace"}</button></div></form>`, () => { $("[data-action=close]").onclick = closeModal; $("#job-import").onsubmit = async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const job = { id: uid(), title: form.get("title").trim(), company: form.get("company").trim(), location: form.get("location").trim(), source_url: form.get("url").trim(), source_name: imported.source_name || (state.importedJob ? "RoleReady extension" : "Manual import"), fetched_at: today(), description: form.get("description").trim(), status: "shortlisted", analysis: imported.analysis || {}, sources: imported.sources || [] }; const button = $("#job-import button.primary"); button.disabled = true; button.textContent = analyze ? "Analyzing evidence…" : "Saving…"; if (session && (analyze || !job.analysis?.proofMap?.length)) { try { const result = await api("/api/role", { job }); job.analysis = result.analysis; job.sources = result.sources; } catch (error) { toast(`Saved without live analysis: ${error.message}`); } } if (!await saveJob(job)) { button.disabled = false; button.textContent = "Try saving again"; return; } state.selectedJobId = job.id; state.importedJob = null; closeModal(); state.view = "job"; render(); }; }); }

async function saveJob(job) { const normalized = { ...job, status: legacyStatus(job.status) }; if (session && supabase) { const { data, error } = await supabase.from("saved_jobs").upsert({ ...normalized, user_id: session.user.id }).select().single(); if (error) { toast(`Role was not saved: ${error.message}`); return false; } state.jobs = [{ ...data, status: legacyStatus(data.status) }, ...state.jobs.filter((item) => item.id !== normalized.id)]; toast("Role saved to your cloud workspace."); return true; } state.jobs = [normalized, ...state.jobs.filter((item) => item.id !== normalized.id)]; toast("Saved in demo mode. Sign in to sync it."); return true; }

function openEditJobModal(job) {
  openModal(`<form id="edit-job-form"><label>Job title<input name="title" required value="${esc(job.title)}"></label><label>Company<input name="company" required value="${esc(job.company)}"></label><label>Location<input name="location" value="${esc(job.location || "")}"></label><label>Source URL<input name="url" type="url" value="${esc(job.source_url || "")}"></label><label>Job description<textarea name="description" required>${esc(job.description || "")}</textarea></label><label class="toggle"><input name="reanalyze" type="checkbox"><span>Rebuild the Proof Map with this edited listing</span></label><div class="form-actions">${actionButton("Cancel", "close", "secondary")}<button class="primary">Save role</button></div></form>`, () => {
    $("[data-action=close]").onclick = closeModal;
    $("#edit-job-form").onsubmit = async (event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const updated = { ...job, title: form.get("title").trim(), company: form.get("company").trim(), location: form.get("location").trim(), source_url: form.get("url").trim(), description: form.get("description").trim() };
      const button = $("#edit-job-form button.primary"); button.disabled = true; button.textContent = "Saving…";
      if (form.get("reanalyze") && session) {
        try { const result = await api("/api/role", { job: updated }); updated.analysis = result.analysis; updated.sources = result.sources; }
        catch (error) { button.disabled = false; button.textContent = "Save role"; return toast(`Role was not changed: ${error.message}`); }
      }
      if (!await saveJob(updated)) { button.disabled = false; button.textContent = "Try saving again"; return; }
      closeModal(); render();
    };
  });
}

async function deleteJob(id) {
  const job = state.jobs.find((item) => item.id === id); if (!job) return;
  if (!window.confirm(`Delete “${job.title}” and its milestones, Proof Sprints, and application kit? This cannot be undone.`)) return;
  if (session && supabase) {
    const { error } = await supabase.from("saved_jobs").delete().eq("id", id);
    if (error) return toast(`Role was not deleted: ${error.message}`);
  }
  state.jobs = state.jobs.filter((item) => item.id !== id);
  state.milestones = state.milestones.filter((item) => item.saved_job_id !== id);
  state.sprints = state.sprints.filter((item) => item.saved_job_id !== id);
  state.kits = state.kits.filter((item) => item.saved_job_id !== id);
  state.selectedJobId = state.jobs[0]?.id; state.view = state.jobs.length ? "home" : "discover";
  toast("Role workspace deleted."); render();
}

async function saveStage() { const job = selectedJob(); if (!job) return; if (await saveJob({ ...job, status: $("#job-status").value })) render(); }

function openSprintModal() { const job = selectedJob(); if (!job) return; const current = sprintFor(job.id); const gap = job.analysis?.proofMap?.find((item) => item.status !== "proven"); openModal(`<form id="sprint-form"><label>Sprint title<input name="title" required value="${esc(current?.title || `Proof: ${gap?.requirement || "your strongest gap"}`)}"></label><label>Deliverable<textarea name="deliverable" required>${esc(current?.deliverable || gap?.nextAction || "Build a small, reviewable artifact tied to one role requirement.")}</textarea></label><label>Checklist, one per line<textarea name="checklist">${esc((current?.checklist || ["Build the artifact", "Add a README or screenshot", "Confirm what you can honestly claim"]).map((item) => typeof item === "string" ? item : item.label).join("\n"))}</textarea></label><label>Due date<input name="due" type="date" value="${esc(current?.due_date || job.next_date || "")}"></label><label>Artifact URL (required to complete)<input name="url" type="url" value="${esc(current?.artifact_url || "")}"></label><label>Honest resume bullet after completion<textarea name="bullet" placeholder="Only describe what this finished artifact proves.">${esc(current?.honest_resume_bullet || "")}</textarea></label><label><input name="confirm-artifact" type="checkbox"> I confirm this artifact is completed, accurate, and I can discuss it. Add it to my Evidence Vault.</label><div class="form-actions">${actionButton("Cancel", "close", "secondary")}<button class="primary">Save Proof Sprint</button></div></form>`, () => { $("[data-action=close]").onclick = closeModal; $("#sprint-form").onsubmit = async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const url = form.get("url").trim(); const complete = Boolean(url && form.get("confirm-artifact")); if (url && !complete) return toast("Confirm the completed artifact before unlocking its resume claim."); let sprint = { id: current?.id || uid(), user_id: session?.user?.id, saved_job_id: job.id, title: form.get("title").trim(), deliverable: form.get("deliverable").trim(), checklist: form.get("checklist").split("\n").map((item) => item.trim()).filter(Boolean), due_date: form.get("due") || null, artifact_url: url || null, honest_resume_bullet: complete ? form.get("bullet").trim() || null : null, target_requirement: gap?.requirement || null, evidence_id: current?.evidence_id || null, status: complete ? "complete" : "in_progress", completed_at: complete ? new Date().toISOString() : null }; if (complete) sprint = await materializeSprintEvidence(sprint); if (!await saveSprint(sprint)) return; closeModal(); render(); }; }); }

async function materializeSprintEvidence(sprint) { const evidence = { id: sprint.evidence_id || uid(), user_id: session?.user?.id, kind: "project", title: `Proof Sprint — ${sprint.title}`, details: `${sprint.deliverable} Completed artifact: ${sprint.artifact_url}`, source: `Proof Sprint artifact: ${sprint.artifact_url}`, confirmed: true }; if (session && supabase) { const { error } = await supabase.from("candidate_evidence").upsert(evidence); if (error) throw new Error(`Artifact evidence could not be saved: ${error.message}`); } state.evidence = [evidence, ...state.evidence.filter((item) => item.id !== evidence.id)]; return { ...sprint, evidence_id: evidence.id }; }

async function saveSprint(sprint) { if (session && supabase) { const { error } = await supabase.from("proof_sprints").upsert(sprint); if (error) { toast(`Proof Sprint was not saved: ${error.message}`); return false; } } state.sprints = [sprint, ...state.sprints.filter((item) => item.id !== sprint.id)]; toast(sprint.status === "complete" ? "Proof Sprint completed and added as confirmed Evidence Vault proof." : "Proof Sprint saved."); return true; }

async function deleteSprint(id) {
  const sprint = state.sprints.find((item) => item.id === id); if (!sprint) return;
  if (!window.confirm(`Delete “${sprint.title}”? Completed artifact evidence stays in your Evidence Vault unless you delete it separately.`)) return;
  if (session && supabase) {
    const { error } = await supabase.from("proof_sprints").delete().eq("id", id);
    if (error) return toast(`Proof Sprint was not deleted: ${error.message}`);
  }
  state.sprints = state.sprints.filter((item) => item.id !== id);
  toast("Proof Sprint deleted."); render();
}

function openMilestoneModal() { const job = selectedJob() || state.jobs[0]; openModal(`<form id="milestone-form"><label>Role<select name="job">${state.jobs.map((item) => `<option value="${esc(item.id)}" ${item.id === job?.id ? "selected" : ""}>${esc(item.company)} · ${esc(item.title)}</option>`).join("")}</select></label><label>Milestone<select name="kind"><option value="deadline">Application deadline</option><option value="assessment">Assessment</option><option value="interview">Interview</option><option value="follow_up">Follow-up</option></select></label><label>Date and time<input name="due" type="datetime-local" required></label><label>Note<input name="note" placeholder="What should you prepare?"></label><div class="form-actions">${actionButton("Cancel", "close", "secondary")}<button class="primary">Schedule milestone</button></div></form>`, () => { $("[data-action=close]").onclick = closeModal; $("#milestone-form").onsubmit = async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const milestone = { id: uid(), user_id: session?.user?.id, saved_job_id: form.get("job"), kind: form.get("kind"), due_at: new Date(form.get("due")).toISOString(), note: form.get("note").trim(), reminder_enabled: true }; if (session && supabase) { const { error } = await supabase.from("milestones").insert(milestone); if (error) { toast(`Milestone was not scheduled: ${error.message}`); return; } } state.milestones = [...state.milestones, milestone].sort((a, b) => a.due_at.localeCompare(b.due_at)); toast("Milestone scheduled. Email reminders follow your preference."); closeModal(); render(); }; }); }

async function completeMilestone(id) {
  const milestone = state.milestones.find((item) => item.id === id); if (!milestone) return;
  const completed_at = new Date().toISOString();
  if (session && supabase) {
    const { error } = await supabase.from("milestones").update({ completed_at }).eq("id", id);
    if (error) return toast(`Milestone was not updated: ${error.message}`);
  }
  state.milestones = state.milestones.map((item) => item.id === id ? { ...item, completed_at } : item);
  toast("Milestone completed."); render();
}

async function deleteMilestone(id) {
  const milestone = state.milestones.find((item) => item.id === id); if (!milestone) return;
  if (!window.confirm("Delete this scheduled milestone? This cannot be undone.")) return;
  if (session && supabase) {
    const { error } = await supabase.from("milestones").delete().eq("id", id);
    if (error) return toast(`Milestone was not deleted: ${error.message}`);
  }
  state.milestones = state.milestones.filter((item) => item.id !== id);
  toast("Milestone deleted."); render();
}

async function generateKit() { const job = selectedJob(); const evidenceIds = $$(".kit-evidence:checked").map((item) => item.value); if (!evidenceIds.length) return toast("Choose at least one confirmed evidence item."); if (!session) { state.generatedKit = { summary: "Sign in to create a role-specific application kit from confirmed evidence.", bulletOptions: state.evidence.filter((item) => evidenceIds.includes(item.id)).map((item) => ({ evidenceId: item.id, title: item.title, bullet: item.details })), recruiterNote: "", companyInterest: "", answers: [] }; return render(); } try { const result = await api("/api/application-kit", { jobId: job.id, evidenceIds }); state.generatedKit = result.kit; const existing = state.kits.find((kit) => kit.saved_job_id === job.id); const record = { id: existing?.id || uid(), user_id: session.user.id, saved_job_id: job.id, selected_evidence_ids: evidenceIds, content: result.kit, config: { headline: $("#kit-headline").value.trim(), portfolio: $("#kit-portfolio").value.trim() }, updated_at: new Date().toISOString() }; state.kits = [record, ...state.kits.filter((kit) => kit.id !== record.id)]; const { error } = await supabase.from("application_kits").upsert(record); if (error) toast(error.message); render(); } catch (error) { toast(error.message); } }

function currentKit() { const job = selectedJob(); return state.kits.find((kit) => kit.saved_job_id === job?.id)?.content || state.generatedKit; }
function cloneKit(kit) { return JSON.parse(JSON.stringify(kit || {})); }
function kitRecord(job = selectedJob()) { return state.kits.find((record) => record.saved_job_id === job?.id); }
function captureKitEdits() {
  const kit = currentKit();
  if (!kit) return null;
  const edited = cloneKit(kit);
  const preview = $("#kit-preview");
  if (!preview) return edited;
  preview.querySelectorAll("[data-kit-field]").forEach((field) => { edited[field.dataset.kitField] = field.textContent.trim(); });
  preview.querySelectorAll("[data-kit-bullet-id]").forEach((field) => {
    const bullet = edited.bulletOptions?.find((item) => String(item.evidenceId) === field.dataset.kitBulletId);
    if (bullet) bullet.bullet = field.textContent.trim();
  });
  return edited;
}
function selectedEvidenceForKit(job, kit) {
  const ids = kitRecord(job)?.selected_evidence_ids || kit?.bulletOptions?.map((item) => item.evidenceId) || [];
  const evidenceById = new Map(state.evidence.map((item) => [item.id, item]));
  const ordered = (kit?.bulletOptions || []).map((item) => evidenceById.get(item.evidenceId)).filter(Boolean);
  return ordered.length ? ordered : ids.map((id) => evidenceById.get(id)).filter(Boolean);
}
async function persistKit(kit, quiet = false) {
  const job = selectedJob();
  if (!job || !kit) return null;
  const previous = kitRecord(job);
  const record = previous ? { ...previous, content: kit, updated_at: new Date().toISOString() } : null;
  state.generatedKit = kit;
  if (!record) { if (!quiet) toast("Sign in and generate a kit to save it to your workspace."); return kit; }
  state.kits = [record, ...state.kits.filter((item) => item.id !== record.id)];
  if (session && supabase) {
    const { error } = await supabase.from("application_kits").upsert(record);
    if (error) { toast(error.message); return null; }
  }
  if (!quiet) toast("Application Studio edits saved.");
  return kit;
}
async function saveKitEdits() { await persistKit(captureKitEdits()); }
async function moveKitBullet(index, direction) {
  const kit = captureKitEdits(); const destination = index + direction;
  if (!kit?.bulletOptions || destination < 0 || destination >= kit.bulletOptions.length) return;
  [kit.bulletOptions[index], kit.bulletOptions[destination]] = [kit.bulletOptions[destination], kit.bulletOptions[index]];
  if (await persistKit(kit, true)) render();
}
async function copyRecruiterNote() { const note = captureKitEdits()?.recruiterNote; if (!note) return toast("Generate a kit first."); await navigator.clipboard.writeText(note); toast("Recruiter note copied for your review."); }
function printKit() { const job = selectedJob(); const kit = captureKitEdits(); if (!kit) return toast("Generate a kit first."); const selected = selectedEvidenceForKit(job, kit); const windowRef = window.open("", "_blank"); if (!windowRef) return toast("Allow pop-ups to print your application kit."); windowRef.document.write(`<html><head><title>${esc(job.company)} application kit</title><style>body{max-width:760px;margin:48px auto;font:14px/1.55 Arial;color:#151b24}h1{margin-bottom:4px}h2{margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:5px}.meta{color:#64748b}.item{margin:18px 0}.note{margin-top:40px;color:#64748b;font-size:11px}</style></head><body><h1>${esc(state.profile.full_name)}</h1><p class="meta">${esc(state.profile.target_role)} · ${esc(job.company)} application</p><h2>Summary</h2><p>${esc(kit.summary)}</p><h2>Selected experience</h2>${selected.map((item) => `<div class="item"><b>${esc(item.title)}</b><p>${esc(kit.bulletOptions?.find((bullet) => bullet.evidenceId === item.id)?.bullet || item.details)}</p></div>`).join("")}<h2>Recruiter note</h2><p>${esc(kit.recruiterNote)}</p><h2>Why this role</h2><p>${esc(kit.companyInterest)}</p><p class="note">Generated by RoleReady from user-confirmed evidence. Review before sending.</p></body></html>`); windowRef.document.close(); windowRef.focus(); windowRef.print(); }
async function downloadDocx() { const job = selectedJob(); const kit = captureKitEdits(); if (!kit || !session) return toast("Sign in and generate an application kit first."); const selectedEvidence = selectedEvidenceForKit(job, kit).map((item) => ({ ...item, bullet: kit.bulletOptions?.find((bullet) => bullet.evidenceId === item.id)?.bullet })); try { const response = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json", ...tokenHeaders() }, body: JSON.stringify({ candidate: { ...state.profile, portfolio: kitRecord(job)?.config?.portfolio }, job, kit, selectedEvidence }) }); if (!response.ok) throw new Error((await response.json()).error); const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `${job.company}-application-kit.docx`; link.click(); URL.revokeObjectURL(url); } catch (error) { toast(error.message); } }

async function runCode() {
  const output = $("#code-output");
  const challenge = CHALLENGES[state.selectedChallengeId];
  const code = $("#code").value;
  const startedAt = Date.now();
  state.code = code;
  output.textContent = "Running server-evaluated checks in an isolated sandbox…";
  if (!session) {
    output.textContent = "Sign in to run the server-evaluated assessment. The editor remains available for practice.";
    return;
  }
  try {
    const result = await api("/api/assessment", { language: state.language, code, challengeId: challenge.id, jobId: selectedJob()?.id });
    state.assessmentOutput = `${result.passed ? "✓ Passed" : "Needs another pass"}\n\n${result.output}\n${result.hiddenSummary}\n\nNext: ${result.feedback?.nextStep || "Review your solution."}`;
    output.textContent = state.assessmentOutput;
    const record = {
      id: uid(), user_id: session.user.id, saved_job_id: selectedJob()?.id || null,
      language: state.language, challenge_id: challenge.id, passed: result.passed,
      result_summary: result.output, feedback: result.feedback || {}, elapsed_seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    };
    const { error } = await supabase.from("coding_attempts").insert(record);
    if (error) toast(`Assessment ran, but its history was not saved: ${error.message}`);
    else state.attempts = [record, ...state.attempts].slice(0, 30);
  } catch (error) {
    state.assessmentOutput = `Could not run code: ${error.message}`;
    output.textContent = state.assessmentOutput;
  }
}

async function startInterview() { const job = selectedJob(); if (!session) return toast("Sign in to start a private role-aware interview."); try { const data = await api("/api/voice", { action: "start", job, profile: { ...state.profile, evidence: state.evidence } }); state.interview = { id: uid(), questions: data.questions, turns: [], index: 0, status: "in_progress", consent: false, mode: data.mode || "ai", startedAt: Date.now(), elapsed: "00:00" }; state.view = "interview"; render(); speak(data.questions[0]); startInterviewTimer(); } catch (error) { toast(error.message); } }
function startInterviewTimer() { clearInterval(state.interviewTimer); state.interviewTimer = setInterval(() => { if (!state.interview || state.interview.status !== "in_progress") return clearInterval(state.interviewTimer); const seconds = Math.floor((Date.now() - state.interview.startedAt) / 1000); state.interview.elapsed = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; const label = $(".meeting-context p:last-child"); if (label) label.textContent = `Question ${Math.min(state.interview.index + 1, 4)} of 4 · ${state.interview.elapsed}`; }, 1000); }
async function toggleCamera() { if (cameraStream) { stopCamera(); return render(); } try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); render(); } catch { toast("Camera preview is unavailable. Your interview can continue with audio or typed answers."); } }
function stopCamera() { cameraStream?.getTracks().forEach((track) => track.stop()); cameraStream = null; }
async function recordAnswer() { const button = $("#record-button"); if (recorder?.state === "recording") { recorder.stop(); recognition?.stop(); button.textContent = "● Start answer"; return; } try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks = []; recorder = new MediaRecorder(stream); recorder.ondataavailable = (event) => chunks.push(event.data); recorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()); $("#record-note").textContent = "Recording complete. Submit your answer when ready."; }; recorder.start(); startRecognition(); button.textContent = "■ Stop recording"; $("#record-note").textContent = "Recording… answer naturally, then press Stop recording."; } catch { $("#record-note").textContent = "Microphone access was unavailable. Type your response below instead."; } }
function startRecognition() { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) return; recognition = new Recognition(); recognition.continuous = true; recognition.interimResults = true; recognition.onresult = (event) => { let text = ""; for (let index = event.resultIndex; index < event.results.length; index++) text += event.results[index][0].transcript; $("#transcript").textContent = text; }; recognition.start(); }
async function transcribeAudio() { const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" }); const dataBase64 = await fileBase64(blob); const result = await api("/api/voice", { action: "transcribe", audioBase64: dataBase64, format: "webm" }); return result.text; }
async function resolvedInterviewAnswer() {
  const typed = $("#typed-answer")?.value.trim();
  if (typed) return typed;
  const transcript = $("#transcript")?.textContent.trim();
  if (transcript && transcript !== "Your transcript will appear here.") return transcript;
  if (recorder?.state === "recording") throw new Error("Stop recording before you submit your answer.");
  if (!chunks.length) return "";
  $("#record-note").textContent = "Transcribing your recorded answer…";
  const answer = await transcribeAudio();
  $("#transcript").textContent = answer || "Your transcript will appear here.";
  return answer;
}
async function submitAnswer() { const interview = state.interview; let answer; try { answer = await resolvedInterviewAnswer(); } catch (error) { return toast(error.message); } if (!answer) return toast("Record or type an answer first."); const question = interview.questions[interview.index]; const current = { question, answer }; $("#record-note").textContent = "Reviewing your answer against this role…"; try { const result = await api("/api/voice", { action: "turn", job: selectedJob(), profile: { ...state.profile, evidence: state.evidence }, question, answer }); current.feedback = result.feedback; interview.mode = result.mode || interview.mode; interview.turns[interview.index] = current; if (interview.index < 3) { interview.index++; render(); speak(interview.questions[interview.index]); } else { await finishInterview(); } } catch (error) { toast(error.message); } }
async function finishInterview() { const interview = state.interview; try { const result = await api("/api/voice", { action: "finish", job: selectedJob(), profile: { ...state.profile, evidence: state.evidence }, turns: interview.turns }); interview.report = result.report; interview.mode = result.mode || interview.mode; interview.status = "complete"; clearInterval(state.interviewTimer); if (interview.consent && session) await supabase.from("interview_sessions").insert({ id: interview.id, user_id: session.user.id, saved_job_id: selectedJob()?.id || null, transcript: interview.turns.map((turn) => `Q: ${turn.question}\nA: ${turn.answer}`).join("\n\n"), score: result.report.overallScore, feedback: result.report, question_plan: interview.questions, turns: interview.turns, status: "complete", consent_to_save: true }); render(); speak(`Interview complete. Your score is ${result.report.overallScore} out of 100.`); } catch (error) { toast(error.message); } }
async function speak(text) { if (!text) return; try { const result = await api("/api/voice", { action: "speak", text }); if (result.audioBase64) { const audio = new Audio(`data:${result.mimeType || "audio/mpeg"};base64,${result.audioBase64}`); audio.play(); return; } } catch { /* Native browser speech is the reliable fallback. */ } speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); }

function toast(message) { const root = $("#toast"); if (!root) return; root.textContent = message; root.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => root.classList.remove("show"), 3600); }

setup();
