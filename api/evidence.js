import mammoth from "mammoth";
import pdf from "pdf-parse";
import { allow, allowedOrigin, clean, json, verifiedUser } from "../lib/server.js";

const MAX_FILE_BYTES = 5_000_000;

function classify(line) {
  const value = line.toLowerCase();
  if (/education|university|college|bachelor|master/.test(value)) return "education";
  if (/experience|employment|work history|internship/.test(value)) return "experience";
  if (/project|portfolio|open source/.test(value)) return "project";
  return "project";
}

function proposeEvidence(text) {
  const lines = clean(text, 30_000).split(/\n+/).map((line) => clean(line, 900)).filter(Boolean);
  const proposed = [];
  let activeKind = "project";
  for (let index = 0; index < lines.length && proposed.length < 10; index++) {
    const line = lines[index];
    if (/^(experience|work experience|projects|education|technical skills|skills|leadership|activities)$/i.test(line)) { activeKind = classify(line); continue; }
    if (line.length < 4 || line.length > 180 || /^(email|phone|linkedin|github|www\.)/i.test(line)) continue;
    const detailLines = lines.slice(index + 1, index + 4).filter((item) => item.length > 28 && item.length < 700 && !/^(experience|projects|education|skills)$/i.test(item));
    if (!detailLines.length) continue;
    const details = detailLines.join(" ");
    if (!/[a-z]/i.test(details) || proposed.some((item) => item.title.toLowerCase() === line.toLowerCase())) continue;
    proposed.push({ kind: activeKind, title: line.replace(/^[•\-–]\s*/, ""), details, source: "Resume import — review required", confirmed: false });
    index += Math.max(0, detailLines.length - 1);
  }
  return proposed.length ? proposed : [{ kind: "project", title: "Resume evidence", details: "We could read this file, but could not safely separate individual claims. Add or edit a factual item before confirming.", source: "Resume import — review required", confirmed: false }];
}

async function extractText(fileName, mimeType, data) {
  const buffer = Buffer.from(data, "base64");
  if (buffer.length > MAX_FILE_BYTES) throw new Error("Use a file smaller than 5 MB.");
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".csv") || mimeType.startsWith("text/")) return buffer.toString("utf8");
  if (lower.endsWith(".docx") || mimeType.includes("wordprocessingml")) return (await mammoth.extractRawText({ buffer })).value;
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return (await pdf(buffer)).text;
  throw new Error("Upload a PDF, DOCX, TXT, or LinkedIn CSV export.");
}

export default async function handler(req, res) {
  if (!allowedOrigin(req, res)) return json(res, 403, { error: "This origin is not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const auth = await verifiedUser(req);
  if (!auth) return json(res, 401, { error: "Sign in before importing evidence." });
  if (!allow(`evidence:${auth.user.id}`, 8)) return json(res, 429, { error: "Please wait a moment before another file import." });
  try {
    const fileName = clean(req.body?.fileName, 180);
    const mimeType = clean(req.body?.mimeType, 120) || "application/octet-stream";
    const data = clean(req.body?.dataBase64, 7_000_000);
    if (!fileName || !data) return json(res, 400, { error: "Choose a supported file before importing." });
    const text = await extractText(fileName, mimeType, data);
    return json(res, 200, { fileName, textPreview: clean(text, 1500), proposedEvidence: proposeEvidence(text) });
  } catch (error) {
    return json(res, 422, { error: error.message || "We could not read that file." });
  }
}
