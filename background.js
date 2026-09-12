const DEMO_PROFILE = {
  name: "Alex Chen",
  targetRole: "Software Engineering Intern",
  skills: ["JavaScript", "React", "Python", "SQL", "Node.js", "Git"],
  projects: [
    { name: "CampusConnect", summary: "Built a full-stack campus-events platform used by 200+ students.", skills: ["React", "Node.js", "SQL"] },
    { name: "StudyBuddy", summary: "Created an AI study planner that reduced weekly planning time by 35% in a 20-user pilot.", skills: ["Python", "React"] }
  ],
  experiences: [
    "Software Developer, Student Tech Lab — shipped React features used by 500+ students.",
    "Teaching Assistant — explained data structures and debugging to 40 students weekly."
  ]
};

chrome.runtime.onInstalled.addListener(async () => {
  const { candidateProfile } = await chrome.storage.local.get("candidateProfile");
  if (!candidateProfile) await chrome.storage.local.set({ candidateProfile: DEMO_PROFILE });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "JOB_CONTEXT") {
    chrome.storage.local.set({ currentJob: { ...message.job, capturedAt: Date.now(), sourceUrl: sender.tab?.url || message.job.sourceUrl } });
    sendResponse({ ok: true });
  }
  if (message.type === "GET_CONTEXT") {
    chrome.storage.local.get(["currentJob", "candidateProfile", "savedApplications"]).then(sendResponse);
    return true;
  }
  if (message.type === "SAVE_APPLICATION") {
    chrome.storage.local.get("savedApplications").then(({ savedApplications = [] }) => {
      const entry = { ...message.application, id: crypto.randomUUID(), savedAt: Date.now() };
      chrome.storage.local.set({ savedApplications: [entry, ...savedApplications] }).then(() => sendResponse({ ok: true, entry }));
    });
    return true;
  }
  if (message.type === "UPDATE_APPLICATION") {
    chrome.storage.local.get("savedApplications").then(({ savedApplications = [] }) => {
      const updated = savedApplications.map((entry) => entry.id === message.id ? { ...entry, ...message.changes, updatedAt: Date.now() } : entry);
      chrome.storage.local.set({ savedApplications: updated }).then(() => sendResponse({ ok: true }));
    });
    return true;
  }
  if (message.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    sendResponse({ ok: true });
  }
});
