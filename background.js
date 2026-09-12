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

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function roleReadyIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  const unit = size / 128;
  roundRect(context, 8 * unit, 8 * unit, 112 * unit, 112 * unit, 31 * unit);
  context.fillStyle = "#172033";
  context.fill();
  context.beginPath();
  context.arc(64 * unit, 64 * unit, 46 * unit, Math.PI * .77, Math.PI * 1.77);
  context.strokeStyle = "#7EA5FF";
  context.lineWidth = 8 * unit;
  context.lineCap = "round";
  context.stroke();
  context.fillStyle = "#AFC6FF";
  context.beginPath();
  context.arc(95 * unit, 27 * unit, 6 * unit, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#FFFFFF";
  context.font = `900 ${57 * unit}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("R", 64 * unit, 67 * unit);
  return context.getImageData(0, 0, size, size);
}

async function applyRoleReadyIcon() {
  await chrome.action.setIcon({ imageData: { 16: roleReadyIcon(16), 32: roleReadyIcon(32), 48: roleReadyIcon(48), 128: roleReadyIcon(128) } });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { candidateProfile } = await chrome.storage.local.get("candidateProfile");
  if (!candidateProfile) await chrome.storage.local.set({ candidateProfile: DEMO_PROFILE });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await applyRoleReadyIcon();
});

chrome.runtime.onStartup.addListener(() => applyRoleReadyIcon());
applyRoleReadyIcon().catch(() => { /* The default browser letter is an acceptable fallback before Chrome initializes OffscreenCanvas. */ });

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
      chrome.storage.local.set({ savedApplications: [entry, ...savedApplications], lastSavedApplication: entry }).then(() => sendResponse({ ok: true, entry }));
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
    chrome.storage.local.get(["candidateProfile", "currentJob", "lastSavedApplication"]).then(({ candidateProfile = {}, currentJob, lastSavedApplication }) => {
      const application = lastSavedApplication || (currentJob ? { job: currentJob, result: {} } : null);
      const imported = application ? { ...application.job, analysis: application.result, result: application.result, sources: application.result?.sources || [] } : null;
      const origin = (candidateProfile.apiBaseUrl || "https://role-ready-one.vercel.app").replace(/\/$/, "");
      const encoded = imported ? btoa(unescape(encodeURIComponent(JSON.stringify(imported)))) : "";
      chrome.tabs.create({ url: `${origin}/${encoded ? `?importJob=${encodeURIComponent(encoded)}` : ""}` });
      sendResponse({ ok: true });
    });
    return true;
  }
});
