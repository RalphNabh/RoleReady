import { createHash, randomBytes } from "node:crypto";
import { allow, allowedOrigin, clean, json, userRest, verifiedUser } from "../lib/server.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");

export default async function handler(req, res) {
  if (!allowedOrigin(req, res)) return json(res, 403, { error: "This origin is not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const auth = await verifiedUser(req);
  if (!auth) return json(res, 401, { error: "Sign in before connecting an extension." });
  if (!allow(`extension:${auth.user.id}`, 6)) return json(res, 429, { error: "Please wait before creating another extension key." });
  const action = clean(req.body?.action, 30);
  if (action !== "create") return json(res, 400, { error: "Unknown extension action." });
  const extensionId = clean(req.body?.extensionId, 120) || "chrome-web-store-pending";
  const token = `rr_ext_${randomBytes(24).toString("base64url")}`;
  const response = await userRest("extension_connections", auth.token, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ id: crypto.randomUUID(), user_id: auth.user.id, extension_id: extensionId, token_hash: hash(token) }) });
  if (!response.ok) return json(res, 500, { error: "The extension key could not be saved." });
  return json(res, 200, { token, warning: "Copy this once into RoleReady Extension Options. It is shown only now." });
}
