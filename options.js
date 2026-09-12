const fields = ["name", "targetRole", "skills"];
chrome.storage.local.get("candidateProfile", ({ candidateProfile = {} }) => {
  fields.forEach((key) => document.querySelector(`#${key}`).value = Array.isArray(candidateProfile[key]) ? candidateProfile[key].join(", ") : candidateProfile[key] || "");
  document.querySelector("#evidence").value = JSON.stringify({ projects: candidateProfile.projects || [], experiences: candidateProfile.experiences || [] }, null, 2);
});
document.querySelector("#save-profile").onclick = () => {
  let evidence;
  try { evidence = JSON.parse(document.querySelector("#evidence").value); } catch { document.querySelector("#saved").textContent = "Please keep the evidence field as valid JSON."; return; }
  const profile = {
    name: document.querySelector("#name").value.trim(), targetRole: document.querySelector("#targetRole").value.trim(),
    skills: document.querySelector("#skills").value.split(",").map((x) => x.trim()).filter(Boolean), ...evidence
  };
  chrome.storage.local.set({ candidateProfile: profile }, () => document.querySelector("#saved").textContent = "Saved. Return to a job page and reopen RoleReady.");
};
