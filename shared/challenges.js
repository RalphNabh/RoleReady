export const CHALLENGES = {
  "pair-index": {
    id: "pair-index", title: "Pair Finder", concept: "Arrays & hash maps", minutes: 20,
    prompt: "Return the two indices whose values add to target. Return the lower index first.",
    leetcodeQuery: "two sum hash map",
    tests: [
      { args: [[2, 7, 11, 15], 9], expected: "0,1" },
      { args: [[3, 2, 4], 6], expected: "1,2" },
      { args: [[-1, 8, 4, 5], 4], expected: "0,3" }
    ],
    starter: {
      javascript: "function solve(values, target) {\n  // Return [lowerIndex, higherIndex].\n  return [];\n}",
      typescript: "function solve(values: number[], target: number): number[] {\n  // Return [lowerIndex, higherIndex].\n  return [];\n}",
      python: "def solve(values, target):\n    # Return [lower_index, higher_index].\n    return []",
      java: "import java.util.*;\n\nclass Solution {\n  static int[] solve(int[] values, int target) {\n    return new int[]{};\n  }\n}",
      cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nvector<int> solve(vector<int> values, int target) {\n  return {};\n}",
      csharp: "using System;\n\npublic static class Solution {\n  public static int[] Solve(int[] values, int target) {\n    return Array.Empty<int>();\n  }\n}"
    }
  },
  "unique-events": {
    id: "unique-events", title: "Event Window", concept: "Data handling", minutes: 18,
    prompt: "Return the first unique event names, preserving order, until you reach limit.",
    leetcodeQuery: "remove duplicates array hash set",
    tests: [
      { args: [["login", "login", "save", "share"], 3], expected: "login,save,share" },
      { args: [["open", "close", "open", "sync"], 2], expected: "open,close" },
      { args: [["a", "a", "a"], 4], expected: "a" }
    ],
    starter: {
      javascript: "function solve(events, limit) {\n  // Return the first unique names in order.\n  return [];\n}",
      typescript: "function solve(events: string[], limit: number): string[] {\n  // Return the first unique names in order.\n  return [];\n}",
      python: "def solve(events, limit):\n    # Return the first unique names in order.\n    return []",
      java: "import java.util.*;\n\nclass Solution {\n  static String[] solve(String[] events, int limit) {\n    return new String[]{};\n  }\n}",
      cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nvector<string> solve(vector<string> events, int limit) {\n  return {};\n}",
      csharp: "using System;\n\npublic static class Solution {\n  public static string[] Solve(string[] events, int limit) {\n    return Array.Empty<string>();\n  }\n}"
    }
  },
  "status-summary": {
    id: "status-summary", title: "Reliability Snapshot", concept: "API reliability", minutes: 20,
    prompt: "Return [successful, clientErrors, serverErrors] for a list of HTTP status codes.",
    leetcodeQuery: "array counting frequency",
    tests: [
      { args: [[200, 201, 404, 503, 500]], expected: "2,1,2" },
      { args: [[204, 304, 400, 401]], expected: "2,2,0" },
      { args: [[500, 502, 503]], expected: "0,0,3" }
    ],
    starter: {
      javascript: "function solve(statuses) {\n  // Return [successful, clientErrors, serverErrors].\n  return [];\n}",
      typescript: "function solve(statuses: number[]): number[] {\n  // Return [successful, clientErrors, serverErrors].\n  return [];\n}",
      python: "def solve(statuses):\n    # Return [successful, client_errors, server_errors].\n    return []",
      java: "import java.util.*;\n\nclass Solution {\n  static int[] solve(int[] statuses) {\n    return new int[]{};\n  }\n}",
      cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nvector<int> solve(vector<int> statuses) {\n  return {};\n}",
      csharp: "using System;\n\npublic static class Solution {\n  public static int[] Solve(int[] statuses) {\n    return Array.Empty<int>();\n  }\n}"
    }
  }
};

export function recommendedChallenges(job = {}) {
  const text = `${job.title || ""} ${job.description || ""}`.toLowerCase();
  const order = /api|backend|reliab|service|cloud/.test(text)
    ? ["status-summary", "pair-index", "unique-events"]
    : /frontend|product|data|analytics/.test(text)
      ? ["unique-events", "status-summary", "pair-index"]
      : ["pair-index", "unique-events", "status-summary"];
  return order.map((id) => CHALLENGES[id]);
}

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

export function normalizeAnswer(value = "") {
  return String(value).trim().split(/\r?\n/).filter(Boolean).pop()?.replace(/[\[\]\"'\s]/g, "").toLowerCase() || "";
}

export function testPasses(challenge, test, output) {
  const normalized = normalizeAnswer(output);
  const expected = test.expected.toLowerCase();
  if (challenge.id === "pair-index") return normalized === expected || normalized === expected.split(",").reverse().join(",");
  return normalized === expected;
}
