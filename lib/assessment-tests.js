// Server-only test vectors. This module must never be imported by a browser bundle.
export const ASSESSMENT_TESTS = {
  "pair-index": [
    { args: [[2, 7, 11, 15], 9], expected: "0,1" },
    { args: [[3, 2, 4], 6], expected: "1,2" },
    { args: [[-1, 8, 4, 5], 4], expected: "0,3" }
  ],
  "unique-events": [
    { args: [["login", "login", "save", "share"], 3], expected: "login,save,share" },
    { args: [["open", "close", "open", "sync"], 2], expected: "open,close" },
    { args: [["a", "a", "a"], 4], expected: "a" }
  ],
  "status-summary": [
    { args: [[200, 201, 404, 503, 500]], expected: "2,1,2" },
    { args: [[204, 304, 400, 401]], expected: "2,2,0" },
    { args: [[500, 502, 503]], expected: "0,0,3" }
  ]
};

function value(language, argument) {
  if (language === "java") return Array.isArray(argument) && typeof argument[0] === "string" ? `new String[]{${argument.map((item) => `\"${item}\"`).join(",")}}` : Array.isArray(argument) ? `new int[]{${argument.join(",")}}` : String(argument);
  if (language === "cpp") return Array.isArray(argument) && typeof argument[0] === "string" ? `{${argument.map((item) => `\"${item}\"`).join(",")}}` : Array.isArray(argument) ? `{${argument.join(",")}}` : String(argument);
  if (language === "csharp") return Array.isArray(argument) && typeof argument[0] === "string" ? `new string[]{${argument.map((item) => `\"${item}\"`).join(",")}}` : Array.isArray(argument) ? `new int[]{${argument.join(",")}}` : String(argument);
  if (language === "python") return Array.isArray(argument) ? `[${argument.map((item) => typeof item === "string" ? JSON.stringify(item) : item).join(", ")}]` : String(argument);
  return JSON.stringify(argument);
}

export function runnerSource(challenge, language, code, test) {
  const args = test.args.map((argument) => value(language, argument)).join(", ");
  if (["javascript", "typescript"].includes(language)) return `${code}\nconsole.log(JSON.stringify(solve(${args})));`;
  if (language === "python") return `${code}\nprint(\",\".join(str(item) for item in solve(${args})))`;
  if (language === "java") return `${code}\nclass Main { public static void main(String[] args) { System.out.println(java.util.Arrays.toString(Solution.solve(${args}))); } }`;
  if (language === "cpp") return `${code}\nint main() { auto answer = solve(${args}); for (size_t i = 0; i < answer.size(); i++) { if (i) cout << ','; cout << answer[i]; } return 0; }`;
  if (language === "csharp") return `${code}\npublic class Program { public static void Main() { Console.WriteLine(string.Join(\",\", Solution.Solve(${args}))); } }`;
  return code;
}

function normalizeAnswer(value = "") {
  return String(value).trim().split(/\r?\n/).filter(Boolean).pop()?.replace(/[\[\]\"'\s]/g, "").toLowerCase() || "";
}

export function testPasses(challenge, test, output) {
  const normalized = normalizeAnswer(output);
  const expected = test.expected.toLowerCase();
  return challenge.id === "pair-index" ? normalized === expected || normalized === expected.split(",").reverse().join(",") : normalized === expected;
}
