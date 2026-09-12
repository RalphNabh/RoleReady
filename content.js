function firstText(selectors) {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return "";
}

function clean(text) {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, 12000);
}

function extractJob() {
  const title = firstText(["h1", ".top-card-layout__title", ".job-details-jobs-unified-top-card__job-title", "[data-test='job-title']"]);
  const company = firstText([".topcard__org-name-link", ".top-card-layout__second-subline a", ".job-details-jobs-unified-top-card__company-name a", "[data-test='company-name']"]);
  const description = firstText(["#job-details", ".jobs-description__content", ".content", "main"]) || document.body.innerText;
  const location = firstText([".topcard__flavor--bullet", ".top-card-layout__second-subline", ".job-details-jobs-unified-top-card__bullet"]);
  return { title: clean(title) || "Job posting", company: clean(company) || "Company", location: clean(location), description: clean(description), sourceUrl: window.location.href };
}

chrome.runtime.sendMessage({ type: "JOB_CONTEXT", job: extractJob() });
new MutationObserver(() => chrome.runtime.sendMessage({ type: "JOB_CONTEXT", job: extractJob() }))
  .observe(document.documentElement, { childList: true, subtree: true });
