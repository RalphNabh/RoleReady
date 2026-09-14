import { adminRest, allowedOrigin, clean, json, requireCron, verifiedUser } from "../lib/server.js";

function dateKey(value) { return new Date(value).toISOString().slice(0, 10); }

function calendarDay(value, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
    const fields = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  } catch {
    return dateKey(value);
  }
}

function daysUntil(value, timeZone) {
  const now = new Date(`${calendarDay(new Date(), timeZone)}T00:00:00Z`);
  const due = new Date(`${calendarDay(value, timeZone)}T00:00:00Z`);
  return Math.round((due - now) / 86_400_000);
}

function reminderKey(days) { return days === 3 ? "three-days" : days === 1 ? "one-day" : "today"; }
function subject(milestone, days) { return days === 0 ? `Today: ${milestone.kind} for ${milestone.saved_jobs?.company || "your role"}` : `${days} day${days === 1 ? "" : "s"} left: ${milestone.kind} for ${milestone.saved_jobs?.company || "your role"}`; }

async function userEmail(userId) {
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!response.ok) return "";
  return clean((await response.json()).email, 320);
}

async function sent(milestoneId, key) {
  const response = await adminRest(`reminder_deliveries?milestone_id=eq.${encodeURIComponent(milestoneId)}&reminder_key=eq.${encodeURIComponent(key)}&select=id&limit=1`);
  return response.ok && (await response.json()).length > 0;
}

async function markSent(milestone, key) {
  await adminRest("reminder_deliveries", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ id: crypto.randomUUID(), user_id: milestone.user_id, milestone_id: milestone.id, reminder_key: key }) });
}

export default async function handler(req, res) {
  if (!allowedOrigin(req, res)) return json(res, 403, { error: "This origin is not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return json(res, 405, { error: "GET only" });
  if (req.query?.status === "1") {
    const auth = await verifiedUser(req);
    if (!auth) return json(res, 401, { error: "Sign in to check reminder availability." });
    return json(res, 200, { available: Boolean(process.env.RESEND_API_KEY && process.env.REMINDER_FROM && process.env.CRON_SECRET), cadence: "daily" });
  }
  if (!requireCron(req)) return json(res, 401, { error: "Cron authorization required." });
  if (!process.env.RESEND_API_KEY || !process.env.REMINDER_FROM) return json(res, 503, { error: "Resend is not configured." });
  try {
    const response = await adminRest("milestones?select=*,saved_jobs(title,company,source_url)&completed_at=is.null&reminder_enabled=eq.true");
    const milestones = response.ok ? await response.json() : [];
    const profileResponse = await adminRest("profiles?select=id,full_name,email_reminders,timezone");
    const profiles = profileResponse.ok ? await profileResponse.json() : [];
    const optedIn = new Map(profiles.filter((profile) => profile.email_reminders).map((profile) => [profile.id, profile]));
    let count = 0;
    for (const milestone of milestones) {
      const profile = optedIn.get(milestone.user_id);
      const days = daysUntil(milestone.due_at, profile?.timezone);
      if (![0, 1, 3].includes(days) || !profile) continue;
      const key = reminderKey(days);
      if (await sent(milestone.id, key)) continue;
      const to = await userEmail(milestone.user_id);
      if (!to) continue;
      const company = milestone.saved_jobs?.company || "your saved role";
      const role = milestone.saved_jobs?.title || "application";
      const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({
        from: process.env.REMINDER_FROM, to: [to], subject: subject(milestone, days),
        html: `<p>Hi ${clean(profile.full_name || "there", 120)},</p><p><strong>${clean(milestone.kind, 60)}</strong> for <strong>${clean(company, 160)} · ${clean(role, 180)}</strong> is ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}. ${clean(milestone.note || "", 500)}</p><p><a href="${process.env.APP_URL || "https://role-ready-one.vercel.app"}?workspace=1">Open your RoleReady workspace</a></p><p style="color:#6b7280">You received this because deadline reminders are enabled in RoleReady.</p>`
      }) });
      if (result.ok) { await markSent(milestone, key); count++; }
    }
    return json(res, 200, { sent: count, checkedAt: dateKey(new Date()) });
  } catch (error) {
    return json(res, 500, { error: "The reminder run could not complete." });
  }
}
