const DEFAULT_APP_URL = "https://role-ready-one.vercel.app";

chrome.storage.local.get("candidateProfile", ({ candidateProfile = {} }) => {
  document.querySelector("#apiBaseUrl").value = candidateProfile.apiBaseUrl || DEFAULT_APP_URL;
  document.querySelector("#connectionToken").value = candidateProfile.connectionToken || "";
});

document.querySelector("#save-profile").onclick = () => {
  const status = document.querySelector("#saved");
  let apiBaseUrl;
  try {
    apiBaseUrl = new URL(document.querySelector("#apiBaseUrl").value.trim()).href.replace(/\/$/, "");
    if (!apiBaseUrl.startsWith("https://")) throw new Error();
  } catch {
    status.textContent = "Use a valid HTTPS workspace URL.";
    return;
  }
  const connectionToken = document.querySelector("#connectionToken").value.trim();
  if (!connectionToken || connectionToken.length < 20) {
    status.textContent = "Paste the connection key from RoleReady Evidence Vault.";
    return;
  }
  chrome.storage.local.get("candidateProfile", ({ candidateProfile = {} }) => {
    chrome.storage.local.set({ candidateProfile: { ...candidateProfile, apiBaseUrl, connectionToken } }, () => {
      status.textContent = "Connected. Return to a supported job page and reopen RoleReady.";
    });
  });
};
