import { CHALLENGES } from "../shared/challenges.js";
import { ASSESSMENT_TESTS, batchTestPasses, runnerSource } from "../lib/assessment-tests.js";
import { allow, allowedOrigin, clean, json, verifiedUser } from "../lib/server.js";

const LANGUAGES = {
  javascript: { judge0LanguageId: 63 },
  typescript: { judge0LanguageId: 74, compilerOptions: "--target ES2015 --lib ES2015,DOM" },
  python: { judge0LanguageId: 71 },
  java: { judge0LanguageId: 62 },
  cpp: { judge0LanguageId: 52 },
  csharp: { judge0LanguageId: 51 }
};

async function execute(selected, content) {
  const baseUrl = clean(process.env.JUDGE0_URL || "https://ce.judge0.com", 400).replace(/\/$/, "");
  const token = clean(process.env.JUDGE0_AUTH_TOKEN, 1000);
  const response = await fetch(`${baseUrl}/submissions?base64_encoded=false&wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "X-Auth-Token": token } : {}) },
    body: JSON.stringify({
      source_code: content, language_id: selected.judge0LanguageId,
      ...(selected.compilerOptions ? { compiler_options: selected.compilerOptions } : {}),
      cpu_time_limit: 3, wall_time_limit: 5, memory_limit: 128000
    })
  });
  if (!response.ok) throw new Error("The assessment sandbox is busy. Please retry shortly.");
  const result = await response.json();
  const statusId = Number(result.status?.id);
  return {
    compiled: !result.compile_output,
    exitCode: statusId === 3 ? 0 : 1,
    output: clean(result.stdout || result.stderr || result.compile_output || result.message || result.status?.description || "", 8000)
  };
}

export default async function handler(req, res) {
  if (!allowedOrigin(req, res)) return json(res, 403, { error: "This origin is not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const auth = await verifiedUser(req);
  if (!auth) return json(res, 401, { error: "Sign in with GitHub before running an assessment." });
  if (!allow(`assessment:${auth.user.id}`, 6)) return json(res, 429, { error: "Please wait a moment before the next run." });
  const language = clean(req.body?.language, 30);
  const code = clean(req.body?.code, 30_000);
  const challenge = CHALLENGES[clean(req.body?.challengeId, 60)];
  const tests = challenge ? ASSESSMENT_TESTS[challenge.id] : null;
  const selected = LANGUAGES[language];
  if (!selected || !challenge || !tests || !code) return json(res, 400, { error: "Choose a supported language, challenge, and solution." });
  try {
    const execution = await execute(selected, runnerSource(challenge, language, code, tests));
    if (!execution.compiled || execution.exitCode !== 0) {
      return json(res, 200, { passed: false, output: execution.output || "Your program did not finish successfully.", hiddenSummary: "Compiler and runtime feedback are shown; RoleReady never stores your raw code.", feedback: { kind: "runtime", nextStep: "Fix the compiler or runtime message, then retry." } });
    }
    const results = batchTestPasses(challenge, tests, execution.output);
    const passed = results.every(Boolean);
    const passedCount = results.filter(Boolean).length;
    return json(res, 200, {
      passed,
      output: passed ? "All server-evaluated checks passed." : `Passed ${passedCount} of ${results.length} server-evaluated checks.`,
      hiddenSummary: "RoleReady evaluates checks on the server and never stores your raw code.",
      feedback: passed ? { kind: "success", nextStep: "Explain your time/space complexity aloud before moving to the next challenge." } : { kind: "logic", nextStep: "Recheck edge cases, output order, and the exact function contract." }
    });
  } catch (error) {
    return json(res, 503, { error: error.message || "The assessment runner could not complete this request." });
  }
}
