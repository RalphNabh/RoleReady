export const CHALLENGES = {
  "pair-index": {
    id: "pair-index", title: "Pair Finder", concept: "Arrays & hash maps", minutes: 20,
    prompt: "Return the two indices whose values add to target. Return the lower index first.",
    leetcodeQuery: "two sum hash map",
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
