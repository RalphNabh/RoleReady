const view = document.querySelector("#view");
const jobCard = document.querySelector("#job-card");
let state = { candidateProfile: {}, savedApplications: [], currentJob: null };
let activeTab = "overview";

const esc = (value = "") => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const statusOrder = ["saved", "applied", "assessment", "interview", "offer"];
const statusLabel = (value) => ({ saved: "Saved", applied: "Applied", assessment: "Assessment", interview: "Interview", offer: "Offer" }[value] || "Saved");
function appData() { return state.savedApplications || []; }
function fit(entry) { return entry.result?.score ?? 0; }
function sortedApps() { return [...appData()].sort((a, b) => fit(b) - fit(a)); }
function renderCards(entries, empty) {
  if (!entries.length) return `<div class="empty"><span>✦</span><h2>${empty}</h2><p>Open a job posting and use RoleReady to analyze it. Strong opportunities will appear here.</p></div>`;
  const wrapper = document.createElement("div"); wrapper.className = "job-list";
  entries.forEach((entry) => {
    const fragment = jobCard.content.cloneNode(true);
    const node = fragment.querySelector(".job-card");
    node.querySelector(".fit").textContent = `${fit(entry)}%`;
    node.querySelector("h3").textContent = entry.job.title;
    node.querySelector(".meta").textContent = `${entry.job.company}${entry.job.location ? ` · ${entry.job.location}` : ""}`;
    node.querySelector(".caption").textContent = entry.result?.scoreNote || (fit(entry) >= 70 ? "Strong application target" : "Worth a strategic look");
    const tag = node.querySelector(".status"); tag.textContent = statusLabel(entry.status); tag.classList.add(entry.status || "saved");
    node.dataset.entry = entry.id;
    wrapper.append(fragment);
  });
  return wrapper.outerHTML;
}
function overview() {
  const apps = appData();
  const strongest = sortedApps()[0];
  const counts = statusOrder.map((status) => [status, apps.filter((x) => (x.status || "saved") === status).length]);
  view.innerHTML = `<section class="hero"><div><p class="eyebrow">${esc(state.candidateProfile.name || "YOUR").toUpperCase()}’S JOB SEARCH</p><h2>${strongest ? `Your strongest lead is ${esc(strongest.job.company)}.` : "Start where the opportunity appears."}</h2><p>${strongest ? `RoleReady found a ${fit(strongest)}% fit for ${esc(strongest.job.title)}. Open it to turn the role into a preparation plan.` : "The extension turns any job page into a fit assessment, then this command center keeps every next step in one place."}</p></div>${strongest ? `<button class="primary" id="open-best">Open preparation plan</button>` : `<button class="primary" id="open-scan">Analyze a job page</button>`}</section><section class="metric-grid">${counts.map(([status, count]) => `<button class="metric" data-status="${status}"><b>${count}</b><span>${statusLabel(status)}</span></button>`).join("")}</section><section class="split"><div><div class="section-heading"><div><p class="eyebrow">RANKED OPPORTUNITIES</p><h2>Best matches</h2></div><button class="text-button" data-tab-link="matches">View all</button></div>${renderCards(sortedApps().slice(0, 3), "No jobs saved yet")}</div><div class="next"><p class="eyebrow">NEXT BEST ACTION</p><h2>${strongest ? "Prepare evidence for your best-fit role" : "Build your evidence vault"}</h2><p>${strongest ? "Review the tailored resume angle, choose a preparation project, and take a role-specific knowledge check." : "Add your projects, experience, and skills before analyzing your first opportunity."}</p><button class="secondary" id="next-action">${strongest ? "Open plan" : "Edit my profile"}</button></div></section>`;
  document.querySelector("#open-best")?.addEventListener("click", () => renderJobDetail(strongest));
  document.querySelector("#open-scan")?.addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" }));
  document.querySelectorAll(".metric").forEach((button) => button.onclick = () => { activeTab = "pipeline"; setTab(); });
  document.querySelectorAll("[data-tab-link]").forEach((button) => button.onclick = () => { activeTab = button.dataset.tabLink; setTab(); });
  document.querySelector("#next-action")?.addEventListener("click", () => strongest ? renderJobDetail(strongest) : chrome.runtime.openOptionsPage());
}
function matches() { view.innerHTML = `<section class="intro"><p>RoleReady ranks opportunities against your actual evidence, never invented qualifications. Analyze more job pages in the extension to grow this list.</p></section>${renderCards(sortedApps(), "No ranked matches yet")}`; }
function pipeline() { const groups = statusOrder.map((status) => `<section class="kanban"><h2>${statusLabel(status)} <span>${appData().filter((x) => (x.status || "saved") === status).length}</span></h2>${renderCards(appData().filter((x) => (x.status || "saved") === status), "Nothing here")}</section>`).join(""); view.innerHTML = `<div class="kanban-grid">${groups}</div>`; }
function calendar() {
  const dated = appData().filter((entry) => entry.nextDate).sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate));
  view.innerHTML = `<section class="calendar-card"><div><p class="eyebrow">INTERVIEWS, ASSESSMENTS & FOLLOW-UPS</p><h2>Your career calendar</h2><p>Set a date inside any role’s preparation plan. RoleReady keeps your application milestones visible.</p></div><div class="calendar-days">${["M","T","W","T","F","S","S"].map((day) => `<span>${day}</span>`).join("")}${Array.from({ length: 28 }, (_, i) => `<i>${i + 1}</i>`).join("")}</div></section><section><h2>Scheduled milestones</h2>${dated.length ? `<div class="timeline">${dated.map((entry) => `<button data-job="${entry.id}"><b>${new Date(`${entry.nextDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</b><span>${esc(entry.job.company)} · ${statusLabel(entry.status)}</span><small>${esc(entry.job.title)}</small></button>`).join("")}</div>` : `<div class="empty small"><h2>No dates scheduled</h2><p>Open any saved job and add an assessment, interview, or follow-up date.</p></div>`}</section>`;
  document.querySelectorAll("[data-job]").forEach((button) => button.onclick = () => renderJobDetail(appData().find((entry) => entry.id === button.dataset.job)));
}
function vault() { const p = state.candidateProfile; view.innerHTML = `<section class="vault"><p class="eyebrow">CANDIDATE EVIDENCE</p><h2>${esc(p.name || "Your career story")}</h2><p>RoleReady uses only this evidence to tailor your application. Update it anytime from Extension options.</p><div class="vault-grid"><div><h3>Target role</h3><p>${esc(p.targetRole || "Not set")}</p></div><div><h3>Skills</h3><p>${(p.skills || []).map(esc).join(" · ") || "Not set"}</p></div></div><h3>Projects</h3>${(p.projects || []).map((project) => `<article><b>${esc(project.name)}</b><p>${esc(project.summary)}</p><small>${(project.skills || []).map(esc).join(" · ")}</small></article>`).join("") || "<p>No project evidence yet.</p>"}<button class="primary" id="edit-profile">Edit evidence vault</button></section>`; document.querySelector("#edit-profile").onclick = () => chrome.runtime.openOptionsPage(); }
function renderJobDetail(entry) {
  const r = entry.result || {}; const skills = state.candidateProfile.skills || []; const weakest = r.gaps?.[0] || "Confirm the role’s key technical requirements.";
  view.innerHTML = `<button class="back" id="back">← Back to command center</button><section class="detail-hero"><p class="eyebrow">${statusLabel(entry.status || "saved").toUpperCase()} ROLE · ${fit(entry)}% FIT</p><h1>${esc(entry.job.title)}</h1><p>${esc(entry.job.company)}${entry.job.location ? ` · ${esc(entry.job.location)}` : ""}</p><div class="status-control"><label>Stage <select id="stage">${statusOrder.map((x) => `<option value="${x}" ${x === (entry.status || "saved") ? "selected" : ""}>${statusLabel(x)}</option>`).join("")}</select></label><label>Next milestone <input id="date" type="date" value="${entry.nextDate || ""}"></label><button class="primary" id="save-stage">Save</button></div></section><div class="detail-grid"><section><p class="eyebrow">APPLICATION ANGLE</p><h2>Use only what’s true</h2><p>${esc(r.bullet || r.resumeBullet || "Review your profile evidence before applying.")}</p><h3>Evidence to lead with</h3><ul>${(r.strengths || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section><section><p class="eyebrow">30-MINUTE PREP SPRINT</p><h2>Build or refresh this proof</h2><p>Make a small, demonstrable project extension tied to <b>${esc((skills.slice(0, 2) || ["the core stack"]).join(" + "))}</b>: add one feature, test it, and prepare a 60-second walkthrough connecting it to this role.</p><p class="callout">Gap to close: ${esc(weakest)}</p></section><section class="quiz"><p class="eyebrow">KNOWLEDGE CHECK</p><h2>Can you explain your fit?</h2><p id="quiz-question">Which answer best proves your technical contribution?</p><button data-answer="weak">“I helped the team with the project.”</button><button data-answer="strong">“I implemented X, made Y decision, and measured Z outcome.”</button><p id="quiz-result"></p></section><section><p class="eyebrow">PUBLIC RESEARCH</p><h2>Prepare for this company</h2>${r.sources?.length ? r.sources.map((source) => `<a class="research" target="_blank" href="${esc(source.url)}"><b>${esc(source.title)}</b><span>${esc(source.highlights?.[0] || "Open source")}</span></a>`).join("") : `<p>No sources stored yet. Reopen this job in the extension with live mode enabled, then save it again.</p>`}</section></div>`;
  document.querySelector("#back").onclick = () => { activeTab = "overview"; setTab(); };
  document.querySelector("#save-stage").onclick = () => chrome.runtime.sendMessage({ type: "UPDATE_APPLICATION", id: entry.id, changes: { status: document.querySelector("#stage").value, nextDate: document.querySelector("#date").value } }, () => load());
  document.querySelectorAll("[data-answer]").forEach((button) => button.onclick = () => document.querySelector("#quiz-result").textContent = button.dataset.answer === "strong" ? "Correct. Specific ownership, technical judgment, and measurable impact make a credible answer." : "Try again: name your individual contribution, the decision you made, and the outcome.");
}
function setTab() {
  document.querySelectorAll(".nav").forEach((button) => button.classList.toggle("active", button.dataset.tab === activeTab));
  const labels = { overview: ["YOUR NEXT BEST ACTION", "Career command center"], matches: ["RANKED BY YOUR EVIDENCE", "Best-fit opportunities"], pipeline: ["EVERY APPLICATION IN ONE PLACE", "Application pipeline"], calendar: ["STAY AHEAD OF EVERY DEADLINE", "Career calendar"], vault: ["THE FACTS ROLE READY CAN USE", "Evidence vault"] };
  document.querySelector("#tab-eyebrow").textContent = labels[activeTab][0]; document.querySelector("#tab-title").textContent = labels[activeTab][1];
  ({ overview, matches, pipeline, calendar, vault })[activeTab]();
  document.querySelectorAll(".job-card[data-entry]").forEach((card) => card.onclick = () => renderJobDetail(appData().find((entry) => entry.id === card.dataset.entry)));
}
function load() { chrome.storage.local.get(["candidateProfile", "savedApplications", "currentJob"], (data) => { state = { ...state, ...data }; setTab(); }); }
document.querySelectorAll(".nav").forEach((button) => button.onclick = () => { activeTab = button.dataset.tab; setTab(); });
document.querySelector("#open-options").onclick = () => chrome.runtime.openOptionsPage();
document.querySelector("#scan").onclick = () => chrome.tabs.create({ url: "https://simplify.jobs" });
load();
