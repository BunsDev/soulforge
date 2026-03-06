export interface BenchTask {
  id: string;
  name: string;
  prompt: string;
  /** Files that should exist after the task (glob patterns) */
  expectFiles?: string[];
  /** Strings that should appear in the specified file after the task */
  expectContains?: { file: string; strings: string[] };
  /** Shell command that should exit 0 after the task */
  expectCommand?: string;
  /** Max steps before we consider it a failure */
  maxSteps?: number;
}

const tasks: BenchTask[] = [
  // ── Read-only comprehension ──

  {
    id: "read-outline",
    name: "File outline",
    prompt:
      "What are the exported classes and public methods in src/core/intelligence/repo-map.ts? Give a one-line description of each.",
    maxSteps: 3,
  },

  {
    id: "find-usage",
    name: "Find usage",
    prompt:
      'Which files import from "./agent-bus"? List them and explain the waiter pattern used in the AgentBus file cache.',
    maxSteps: 5,
  },

  {
    id: "analyze-deps",
    name: "Dependency analysis",
    prompt:
      "What are the direct dependencies of src/core/context/manager.ts? List each import and what it provides. Which is most critical?",
    maxSteps: 4,
  },

  {
    id: "call-chain",
    name: "Trace call chain",
    prompt:
      'Who calls the function "normalizePath" in src/core/agents/agent-bus.ts? Trace the full call chain — which functions call it, and from which files?',
    maxSteps: 4,
  },

  {
    id: "type-question",
    name: "Type investigation",
    prompt:
      'What is the full type definition of "SharedCache" in src/core/agents/agent-bus.ts? What types does it depend on? Are there any type errors in that file?',
    maxSteps: 4,
  },

  {
    id: "symbol-search",
    name: "Find symbol across codebase",
    prompt:
      'Where is CodeIntelligenceRouter defined? What classes implement IntelligenceBackend? List file paths and line numbers.',
    maxSteps: 4,
  },

  // ── Single-file edits ──

  {
    id: "add-function",
    name: "Add function",
    prompt:
      'Create bench/_workspace/utils.ts with a function `slugify(input: string): string` that converts a string to a URL-safe slug (lowercase, hyphens, no special chars). Include 3 edge cases as comments.',
    expectFiles: ["bench/_workspace/utils.ts"],
    expectContains: {
      file: "bench/_workspace/utils.ts",
      strings: ["slugify", "string"],
    },
    maxSteps: 3,
  },

  {
    id: "fix-bug",
    name: "Fix bug",
    prompt:
      "bench/_workspace/buggy.ts has a fibonacci function that returns wrong results. Find and fix the bug so it passes its self-check.",
    expectCommand: "bun run bench/_workspace/buggy.ts",
    maxSteps: 5,
  },

  // ── Multi-file edits ──

  {
    id: "refactor-extract",
    name: "Extract and refactor",
    prompt:
      "bench/_workspace/monolith.ts has validation logic mixed into the main module. Extract all validation into a separate bench/_workspace/validation.ts and update monolith.ts to import from it.",
    expectFiles: [
      "bench/_workspace/validation.ts",
      "bench/_workspace/monolith.ts",
    ],
    maxSteps: 8,
  },

  {
    id: "add-tests",
    name: "Write tests",
    prompt:
      "Write tests for bench/_workspace/utils.ts in bench/_workspace/utils.test.ts using bun:test. If utils.ts doesn't exist, create a simple string utils file first.",
    expectFiles: ["bench/_workspace/utils.test.ts"],
    expectCommand: "bun test bench/_workspace/utils.test.ts",
    maxSteps: 6,
  },

  // ── Real-world feature (multi-file, type-driven) ──

  {
    id: "feature-filter",
    name: "Add filter to task API",
    prompt: `bench/_workspace/task-api/ has a task service with types.ts, store.ts, service.ts, and service.test.ts.

The tests are failing — some tests call listTasks() with a filter argument (status, priority, assignee) but that feature doesn't exist yet.

Understand the existing architecture, add the filtering feature across all relevant files, and make all tests pass.`,
    expectCommand: "bun test bench/_workspace/task-api/service.test.ts",
    maxSteps: 15,
  },

  {
    id: "rename-type",
    name: "Rename type across files",
    prompt: `In bench/_workspace/task-api/, rename the type "CreateTaskInput" to "NewTaskInput" across all files. Make sure there are no type errors after the rename, and all tests still pass.`,
    expectCommand:
      "bun test bench/_workspace/task-api/service.test.ts && grep -rq 'NewTaskInput' bench/_workspace/task-api/types.ts bench/_workspace/task-api/store.ts bench/_workspace/task-api/service.ts && ! grep -rq 'CreateTaskInput' bench/_workspace/task-api/types.ts bench/_workspace/task-api/store.ts bench/_workspace/task-api/service.ts",
    maxSteps: 3,
  },

  // ── Multi-agent dispatch ──

  {
    id: "dispatch-explore",
    name: "Parallel explore",
    prompt:
      "I need a comprehensive analysis of the agent system. Cover: (1) the AgentBus architecture and all its public methods, (2) all files that depend on agent-bus.ts and how they use it, (3) how subagent-tools.ts coordinates multi-agent dispatch. Summarize all findings.",
    maxSteps: 3,
  },

  {
    id: "dispatch-code",
    name: "Parallel code",
    prompt:
      "Create bench/_workspace/math.ts with functions add, subtract, multiply, divide (handle division by zero). Also create bench/_workspace/math.test.ts with bun:test tests for all 4 functions including edge cases. Work on both files in parallel.",
    expectFiles: [
      "bench/_workspace/math.ts",
      "bench/_workspace/math.test.ts",
    ],
    expectCommand: "bun test bench/_workspace/math.test.ts",
    maxSteps: 3,
  },
];

export default tasks;
