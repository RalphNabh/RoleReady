function firstText(selectors) {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return "";
}

function clean(text, limit = 12000) { return (text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit); }

function jobPostingJson(value) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return value.map(jobPostingJson).find(Boolean) || null;
  if (String(value["@type"] || "").toLowerCase().includes("jobposting")) return value;
  return Object.values(value).map(jobPostingJson).find(Boolean) || null;
}

function structuredJob() {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { const posting = jobPostingJson(JSON.parse(script.textContent)); if (posting) return posting; } catch { /* Fall back to page selectors. */ }
  }
  return null;
}

function locationFrom(posting) {
  const place = Array.isArray(posting?.jobLocation) ? posting.jobLocation[0] : posting?.jobLocation;
  const address = place?.address || {};
  return clean([address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(", "), 240);
}

function requirements(description) {
  return clean(description, 9000).split(/(?<=[.!?])\s+/).filter((sentence) => /require|qualif|experience|skill|must|prefer|proficien|knowledge/i.test(sentence)).slice(0, 8).map((text) => ({ text: clean(text, 320) }));
}

function extractJob() {
  const posting = structuredJob();
  const title = clean(posting?.title || firstText(["h1", ".top-card-layout__title", ".job-details-jobs-unified-top-card__job-title", "[data-test='job-title']"]), 220);
  const company = clean(posting?.hiringOrganization?.name || firstText([".topcard__org-name-link", ".top-card-layout__second-subline a", ".job-details-jobs-unified-top-card__company-name a", "[data-test='company-name']"]), 220);
  const description = clean(posting?.description || firstText(["#job-details", ".jobs-description__content", ".content", "main"]) || document.body.innerText, 12000);
  const location = clean(locationFrom(posting) || firstText([".topcard__flavor--bullet", ".top-card-layout__second-subline", ".job-details-jobs-unified-top-card__bullet"]), 240);
  return { title: title || "Job posting", company: company || "Company", location, description, requirements: requirements(description), sourceUrl: window.location.href, extraction: posting ? "structured JobPosting + page confirmation" : "page text" };
}

let extractionTimer;
let lastSignature = "";

function sendContext() {
  const job = extractJob();
  const signature = `${job.sourceUrl}\n${job.title}\n${job.company}\n${job.description.slice(0, 800)}`;
  if (signature === lastSignature) return;
  lastSignature = signature;
  chrome.runtime.sendMessage({ type: "JOB_CONTEXT", job });
}

function scheduleContext() {
  clearTimeout(extractionTimer);
  extractionTimer = setTimeout(sendContext, 500);
}

sendContext();
new MutationObserver(scheduleContext).observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "HIGHLIGHT_REQUIREMENT") return;
  const phrase = clean(message.requirement, 180);
  if (!phrase) return;
  window.find(phrase, false, false, true, false, true, false);
});
