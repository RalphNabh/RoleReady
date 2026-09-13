import { allow, allowedOrigin, clean, json, verifiedUser } from "./shared.js";

function githubHeaders() {
  return { Accept: "application/vnd.github+json", "User-Agent": "RoleReady evidence import" };
}

function repoName(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value || "") ? value : "";
}

function readmeText(payload = {}) {
  try { return Buffer.from(payload.content || "", "base64").toString("utf8").replace(/[#*_`>|]/g, " ").replace(/\s+/g, " ").slice(0, 2200); } catch { return ""; }
}

export default async function handler(req, res) {
  if (!allowedOrigin(req, res)) return json(res, 403, { error: "This origin is not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const auth = await verifiedUser(req);
  if (!auth) return json(res, 401, { error: "Sign in before importing repository evidence." });
  if (!allow(`github:${auth.user.id}`, 12)) return json(res, 429, { error: "Please wait a moment before another GitHub import." });
  const action = clean(req.body?.action, 30);
  try {
    if (action === "repos") {
      const login = clean(req.body?.login || auth.user.user_metadata?.user_name, 80).replace(/^@/, "");
      if (!/^[A-Za-z0-9-]+$/.test(login)) return json(res, 400, { error: "A valid public GitHub username is required." });
      const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=100&sort=updated`, { headers: githubHeaders() });
      if (!response.ok) return json(res, 404, { error: "We could not find public repositories for that GitHub account." });
      const repos = (await response.json()).filter((repo) => !repo.fork && !repo.archived).slice(0, 40).map((repo) => ({
        fullName: repo.full_name, name: repo.name, description: clean(repo.description || "", 300), language: clean(repo.language || "", 60), updatedAt: repo.updated_at, url: repo.html_url
      }));
      return json(res, 200, { login, repos });
    }
    if (action === "preview") {
      const fullName = repoName(clean(req.body?.fullName, 180));
      if (!fullName) return json(res, 400, { error: "Choose a valid public repository." });
      const [repoResponse, readmeResponse, languagesResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/${fullName}`, { headers: githubHeaders() }),
        fetch(`https://api.github.com/repos/${fullName}/readme`, { headers: githubHeaders() }),
        fetch(`https://api.github.com/repos/${fullName}/languages`, { headers: githubHeaders() })
      ]);
      if (!repoResponse.ok) return json(res, 404, { error: "That repository is unavailable." });
      const repo = await repoResponse.json();
      const readme = readmeResponse.ok ? readmeText(await readmeResponse.json()) : "";
      const languages = languagesResponse.ok ? Object.keys(await languagesResponse.json()).slice(0, 6) : [];
      const details = [
        clean(repo.description || "", 400),
        languages.length ? `Primary technologies: ${languages.join(", ")}.` : "",
        readme ? `README excerpt: ${readme.slice(0, 900)}` : ""
      ].filter(Boolean).join(" ");
      const proposed = {
        kind: "project", title: clean(repo.name, 160), details: details || "Public repository selected by candidate; add a truthful description before confirming.",
        source: `GitHub repository: ${repo.html_url}`, source_url: repo.html_url, confirmed: false
      };
      return json(res, 200, { repository: { fullName, url: repo.html_url, readmeAvailable: Boolean(readme), languages }, proposed });
    }
    return json(res, 400, { error: "Unknown GitHub action." });
  } catch (error) {
    return json(res, 502, { error: "GitHub could not complete this import right now." });
  }
}
