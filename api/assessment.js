import { CHALLENGES, runnerSource, testPasses } from "../shared/challenges.js";
import { allow, allowedOrigin, clean, json, verifiedUser } from "./shared.js";

const LANGUAGES = {
  javascript: { runtime: "javascript", file: "main.js" },
  typescript: { runtime: "typescript", file: "main.ts" },
  python: { runtime: "python", file: "main.py" },
  java: { runtime: "java", file: "Main.java" },
  cpp: { runtime: "c++", file: "main.cpp" },
  csharp: { runtime: "csharp", file: "Main.cs" }
};

async function execute(selected, content) {
  const response = await fetch("https://emkc.org/api/v2/piston/execute", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      language: selected.runtime, version: "*", files: [{ name: selected.file, content }], run_timeout: 3000, compile_timeout: 10000
    })
  });
  if (!response.ok) throw new Error("The assessment sandbox is busy. Please retry shortly.");
  const result = await response.json();
  return { compiled: !result.compile, exitCode: result.run?.code, output: clean(result.run?.output || result.compile?.output || result.message || "", 8000) };
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
  const selected = LANGUAGES[language];
  if (!selected || !challenge || !code) return json(res, 400, { error: "Choose a supported language, challenge, and solution." });
  const results = [];
  try {
    for (const test of challenge.tests) {
      const execution = await execute(selected, runnerSource(challenge, language, code, test));
      if (!execution.compiled || execution.exitCode !== 0) {
        return json(res, 200, { passed: false, output: execution.output || "Your program did not finish successfully.", hiddenSummary: "Compilation/runtime feedback shown. Hidden test values remain private.", feedback: { kind: "runtime", nextStep: "Fix the compiler or runtime message, then retry." } });
      }
      results.push({ passed: testPasses(challenge, test, execution.output), output: execution.output });
    }
    const passed = results.every((item) => item.passed);
    const passedCount = results.filter((item) => item.passed).length;
    return json(res, 200, {
      passed,
      output: passed ? "All hidden checks passed." : `Passed ${passedCount} of ${results.length} hidden checks.`,
      hiddenSummary: "RoleReady checks private cases but never stores your raw code.",
      feedback: passed ? { kind: "success", nextStep: "Explain your time/space complexity aloud before moving to the next challenge." } : { kind: "logic", nextStep: "Recheck edge cases, output order, and the exact function contract." }
    });
  } catch (error) {
    return json(res, 503, { error: error.message || "The assessment runner could not complete this request." });
  }
}
