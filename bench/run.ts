#!/usr/bin/env bun
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createForgeAgent } from "../src/core/agents/index.js";
import { ContextManager } from "../src/core/context/manager.js";
import { resolveModel } from "../src/core/llm/provider.js";
import {
  buildProviderOptions,
  type ProviderOptionsResult,
} from "../src/core/llm/provider-options.js";
import {
  onSubagentStep,
  onMultiAgentEvent,
} from "../src/core/agents/subagent-events.js";
import tasks, { type BenchTask } from "./tasks.js";

const DEFAULT_MODEL = "anthropic/claude-haiku-4-5-20251001";
const MAX_STEPS = 15;
const REPO_MAP_TIMEOUT = 30_000;

interface TokenStats {
  input: number;
  output: number;
  cacheRead: number;
}

interface ToolUse {
  name: string;
  backend?: string;
}

interface BusCacheStats {
  fileHits: number;
  fileWaits: number;
  agents: number;
  findings: number;
}

interface TaskResult {
  id: string;
  name: string;
  success: boolean;
  duration: number;
  steps: number;
  tokens: TokenStats;
  toolUses: ToolUse[];
  busCache: BusCacheStats;
  error?: string;
  output: string;
  validation: { passed: boolean; details: string };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let model = DEFAULT_MODEL;
  let filter: string | undefined;
  let maxSteps = MAX_STEPS;
  let skipRepoMap = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model" && args[i + 1]) model = args[++i]!;
    else if (arg === "--filter" && args[i + 1]) filter = args[++i];
    else if (arg === "--max-steps" && args[i + 1]) maxSteps = Number.parseInt(args[++i]!, 10);
    else if (arg === "--no-repomap") skipRepoMap = true;
    else if (arg === "--help") {
      console.log(`Usage: bun bench/run.ts [options]

Options:
  --model <id>        Model to use (default: ${DEFAULT_MODEL})
  --filter <id>       Run only tasks matching this id substring
  --max-steps <n>     Global max steps override (default: ${String(MAX_STEPS)})
  --no-repomap        Skip repo map scan (faster startup, less context)
  --help              Show this help`);
      process.exit(0);
    }
  }

  return { model, filter, maxSteps, skipRepoMap };
}

async function waitForRepoMap(cm: ContextManager, timeout: number): Promise<boolean> {
  if (cm.isRepoMapReady()) return true;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 200));
    if (cm.isRepoMapReady()) return true;
  }
  return false;
}

async function validateTask(
  task: BenchTask,
  cwd: string,
): Promise<{ passed: boolean; details: string }> {
  const checks: string[] = [];
  let passed = true;

  if (task.expectFiles) {
    for (const pattern of task.expectFiles) {
      const fullPath = resolve(cwd, pattern);
      if (existsSync(fullPath)) {
        checks.push(`  [ok] ${pattern} exists`);
      } else {
        checks.push(`  [FAIL] ${pattern} missing`);
        passed = false;
      }
    }
  }

  if (task.expectContains) {
    const fullPath = resolve(cwd, task.expectContains.file);
    if (existsSync(fullPath)) {
      const content = await Bun.file(fullPath).text();
      for (const str of task.expectContains.strings) {
        if (content.includes(str)) {
          checks.push(`  [ok] "${str}" found in ${task.expectContains.file}`);
        } else {
          checks.push(`  [FAIL] "${str}" not found in ${task.expectContains.file}`);
          passed = false;
        }
      }
    } else {
      checks.push(`  [FAIL] ${task.expectContains.file} does not exist`);
      passed = false;
    }
  }

  if (task.expectCommand) {
    try {
      const proc = Bun.spawn(["sh", "-c", task.expectCommand], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        checks.push(`  [ok] "${task.expectCommand}" exited 0`);
      } else {
        const stderr = await new Response(proc.stderr).text();
        checks.push(
          `  [FAIL] "${task.expectCommand}" exited ${String(exitCode)}: ${stderr.slice(0, 200)}`,
        );
        passed = false;
      }
    } catch (err) {
      checks.push(
        `  [FAIL] "${task.expectCommand}" threw: ${err instanceof Error ? err.message : String(err)}`,
      );
      passed = false;
    }
  }

  if (checks.length === 0) {
    checks.push("  [info] read-only task — success based on agent completion");
  }

  return { passed, details: checks.join("\n") };
}

async function runTask(
  task: BenchTask,
  contextManager: ContextManager,
  modelId: string,
  providerOpts: ProviderOptionsResult,
  cwd: string,
): Promise<TaskResult> {
  const start = Date.now();
  let steps = 0;
  let output = "";
  const tokens: TokenStats = { input: 0, output: 0, cacheRead: 0 };
  const toolUses: ToolUse[] = [];
  const busCache: BusCacheStats = { fileHits: 0, fileWaits: 0, agents: 0, findings: 0 };

  const offStep = onSubagentStep((step) => {
    if (step.cacheState === "hit") busCache.fileHits++;
    if (step.cacheState === "wait") busCache.fileWaits++;
  });
  const offMulti = onMultiAgentEvent((event) => {
    if (event.type === "dispatch-done") {
      busCache.agents += event.completedAgents ?? 0;
      busCache.findings += event.findingCount ?? 0;
    }
  });

  try {
    const model = resolveModel(modelId);

    const agent = createForgeAgent({
      model,
      contextManager,
      forgeMode: "default",
      editorIntegration: {
        diagnostics: false,
        symbols: false,
        hover: false,
        references: false,
        definition: false,
        codeActions: false,
        editorContext: false,
        rename: false,
        lspStatus: false,
        format: false,
      },
      providerOptions: providerOpts.providerOptions,
      headers: providerOpts.headers,
      cwd,
    });

    contextManager.updateConversationContext(task.prompt, tokens.input);

    const result = await agent.stream({
      messages: [{ role: "user" as const, content: task.prompt }],
    });

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        output += part.text;
      } else if (part.type === "tool-result") {
        const raw = part.output;
        let backend: string | undefined;
        if (raw && typeof raw === "object" && "backend" in raw) {
          backend = (raw as { backend?: string }).backend;
        } else if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.backend) backend = parsed.backend;
          } catch {}
        }
        toolUses.push({ name: part.toolName, backend });
      } else if (part.type === "finish-step") {
        steps++;
        const usage = part.usage as {
          inputTokens?: number;
          outputTokens?: number;
          inputTokenDetails?: { cacheReadTokens?: number };
        };
        tokens.input += usage.inputTokens ?? 0;
        tokens.output += usage.outputTokens ?? 0;
        tokens.cacheRead += usage.inputTokenDetails?.cacheReadTokens ?? 0;
      }
    }

    offStep();
    offMulti();
    const duration = Date.now() - start;
    const validation = await validateTask(task, cwd);
    const hasOutput = output.trim().length > 0 || steps > 0;

    return {
      id: task.id,
      name: task.name,
      success: validation.passed && hasOutput,
      duration,
      steps,
      tokens,
      toolUses,
      busCache,
      output: output.slice(0, 500),
      validation: !hasOutput
        ? { passed: false, details: "  [FAIL] agent produced no output" }
        : validation,
    };
  } catch (err) {
    offStep();
    offMulti();
    return {
      id: task.id,
      name: task.name,
      success: false,
      duration: Date.now() - start,
      steps,
      tokens,
      toolUses,
      busCache,
      error: err instanceof Error ? err.message : String(err),
      output: output.slice(0, 500),
      validation: {
        passed: false,
        details: `  [FAIL] agent threw: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}

function formatToolUses(uses: ToolUse[]): string {
  const grouped = new Map<string, string[]>();
  for (const u of uses) {
    const key = u.name;
    const existing = grouped.get(key) ?? [];
    if (u.backend && !existing.includes(u.backend)) existing.push(u.backend);
    grouped.set(key, existing);
  }
  return [...grouped.entries()]
    .map(([name, backends]) =>
      backends.length > 0 ? `${name}(${backends.join(",")})` : name,
    )
    .join(" → ");
}

function formatTokens(t: TokenStats): string {
  const total = t.input + t.output;
  const cacheHit = t.input > 0 ? Math.round((t.cacheRead / t.input) * 100) : 0;
  return `${(total / 1000).toFixed(1)}k tok (${(t.input / 1000).toFixed(1)}k in, ${(t.output / 1000).toFixed(1)}k out${t.cacheRead > 0 ? `, ${String(cacheHit)}% cache` : ""})`;
}

function estimateCost(modelId: string, tokens: TokenStats): number {
  const base = modelId.includes("haiku")
    ? { input: 0.8, output: 4 }
    : modelId.includes("sonnet")
      ? { input: 3, output: 15 }
      : modelId.includes("opus")
        ? { input: 15, output: 75 }
        : { input: 3, output: 15 };

  const uncachedInput = tokens.input - tokens.cacheRead;
  const cachedCost = (tokens.cacheRead / 1_000_000) * base.input * 0.1;
  const uncachedCost = (uncachedInput / 1_000_000) * base.input;
  const outputCost = (tokens.output / 1_000_000) * base.output;
  return cachedCost + uncachedCost + outputCost;
}

async function main() {
  const { model, filter, maxSteps, skipRepoMap } = parseArgs();
  const cwd = resolve(import.meta.dir, "..");
  const workspaceDir = join(cwd, "bench", "_workspace");

  console.log("=== SoulForge Benchmark ===");
  console.log(`Model:       ${model}`);
  console.log(`Max steps:   ${String(maxSteps)}`);
  console.log(`Subagents:   on (dispatch tool available)`);

  const selectedTasks = filter ? tasks.filter((t) => t.id.includes(filter)) : tasks;

  if (selectedTasks.length === 0) {
    console.error(`No tasks match filter "${filter}"`);
    process.exit(1);
  }

  // Write fixture files before repo map scan so they're visible to the agent.
  // Matches real-world usage — files exist before you ask the agent to work on them.
  if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });
  for (const task of selectedTasks) {
    if (task.id === "fix-bug") resetBuggyFile(workspaceDir);
    if (task.id === "refactor-extract") resetMonolithFile(workspaceDir);
    if (task.id === "feature-filter") resetTaskApi(workspaceDir);
    if (task.id === "rename-type") resetTaskApiForRename(workspaceDir);
  }

  // Initialize context manager (shared across tasks for repo map reuse)
  const contextManager = new ContextManager(cwd);

  if (!skipRepoMap) {
    process.stdout.write("Repo map:    scanning... ");
    const ready = await waitForRepoMap(contextManager, REPO_MAP_TIMEOUT);
    if (ready) {
      const stats = contextManager.getRepoMap().getStats();
      console.log(
        `ready (${String(stats.files)} files, ${String(stats.symbols)} symbols, ${String(stats.edges)} edges)`,
      );
    } else {
      console.log("timeout — running with file tree fallback");
    }
  } else {
    console.log("Repo map:    skipped");
  }

  // Warm up intelligence layer (spawns standalone LSP servers so they're ready)
  process.stdout.write("Intelligence: warming up... ");
  const { warmupIntelligence, getIntelligenceStatus } = await import(
    "../src/core/intelligence/index.js"
  );
  warmupIntelligence(cwd);
  // Give LSP server a few seconds to initialize
  await new Promise((r) => setTimeout(r, 5_000));
  const status = await getIntelligenceStatus();
  if (status && status.lspServers.length > 0) {
    console.log(
      `ready (${status.lspServers.map((s) => `${s.language}:${s.command}`).join(", ")})`,
    );
  } else {
    console.log(`ts-morph only (no LSP servers found)`);
  }

  // Build provider options (prompt caching, thinking, etc.)
  const providerOpts = buildProviderOptions(model, {
    defaultModel: model,
    routerRules: [],
    editor: { command: "nvim", args: [] },
    theme: { accentColor: "#7c3aed" },
  });

  console.log(`\nRunning ${String(selectedTasks.length)} tasks...\n`);

  const results: TaskResult[] = [];

  for (const task of selectedTasks) {
    process.stdout.write(`[${task.id}] ${task.name}... `);

    // Reset fixtures and context to clean state before each task
    if (task.id === "fix-bug") resetBuggyFile(workspaceDir);
    if (task.id === "refactor-extract") resetMonolithFile(workspaceDir);
    if (task.id === "feature-filter") resetTaskApi(workspaceDir);
    if (task.id === "rename-type") resetTaskApiForRename(workspaceDir);
    contextManager.resetConversationTracking();

    const result = await runTask(task, contextManager, model, providerOpts, cwd);
    results.push(result);

    const status = result.success ? "PASS" : "FAIL";
    const time = `${(result.duration / 1000).toFixed(1)}s`;
    const tok = formatTokens(result.tokens);
    console.log(`${status}  ${time}  ${String(result.steps)} steps  ${tok}`);

    if (result.toolUses.length > 0) {
      console.log(`    tools: ${formatToolUses(result.toolUses)}`);
    }
    if (result.busCache.agents > 0 || result.busCache.fileHits > 0) {
      const parts: string[] = [];
      if (result.busCache.agents > 0) parts.push(`${String(result.busCache.agents)} agents`);
      if (result.busCache.fileHits > 0) parts.push(`${String(result.busCache.fileHits)} cache hits`);
      if (result.busCache.fileWaits > 0) parts.push(`${String(result.busCache.fileWaits)} cache waits`);
      if (result.busCache.findings > 0) parts.push(`${String(result.busCache.findings)} findings`);
      console.log(`    bus: ${parts.join(", ")}`);
    }

    if (!result.success) {
      console.log(result.validation.details);
      if (result.error) console.log(`  Error: ${result.error}`);
    }
  }

  // Summary
  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;
  const totalTime = results.reduce((s, r) => s + r.duration, 0);
  const totalSteps = results.reduce((s, r) => s + r.steps, 0);
  const totalTokens: TokenStats = {
    input: results.reduce((s, r) => s + r.tokens.input, 0),
    output: results.reduce((s, r) => s + r.tokens.output, 0),
    cacheRead: results.reduce((s, r) => s + r.tokens.cacheRead, 0),
  };
  const totalCost = results.reduce((s, r) => s + estimateCost(model, r.tokens), 0);

  console.log("\n=== Results ===\n");
  console.log(`Passed:      ${String(passed)}/${String(results.length)}`);
  console.log(`Failed:      ${String(failed)}`);
  console.log(`Total time:  ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`Total steps: ${String(totalSteps)}`);
  console.log(`Total tokens: ${formatTokens(totalTokens)}`);
  console.log(`Est. cost:   $${totalCost.toFixed(4)}`);
  console.log(`Avg time:    ${(totalTime / results.length / 1000).toFixed(1)}s/task`);
  console.log(`Avg steps:   ${(totalSteps / results.length).toFixed(1)}/task`);

  // Tool & intelligence breakdown
  const allToolUses = results.flatMap((r) => r.toolUses);
  const toolCounts = new Map<string, number>();
  const backendCounts = new Map<string, number>();
  for (const tu of allToolUses) {
    toolCounts.set(tu.name, (toolCounts.get(tu.name) ?? 0) + 1);
    if (tu.backend) backendCounts.set(tu.backend, (backendCounts.get(tu.backend) ?? 0) + 1);
  }

  console.log("\n--- Tool Usage ---\n");
  const sortedTools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sortedTools) {
    console.log(`  ${name.padEnd(20)} ${String(count).padStart(3)}x`);
  }

  if (backendCounts.size > 0) {
    console.log("\n--- Intelligence Backends ---\n");
    const sortedBackends = [...backendCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [backend, count] of sortedBackends) {
      console.log(`  ${backend.padEnd(20)} ${String(count).padStart(3)}x`);
    }
  }

  const totalBusHits = results.reduce((s, r) => s + r.busCache.fileHits, 0);
  const totalBusWaits = results.reduce((s, r) => s + r.busCache.fileWaits, 0);
  const totalAgents = results.reduce((s, r) => s + r.busCache.agents, 0);
  const totalFindings = results.reduce((s, r) => s + r.busCache.findings, 0);
  if (totalAgents > 0 || totalBusHits > 0) {
    console.log("\n--- Bus Cache (subagent sharing) ---\n");
    console.log(`  Agents dispatched:   ${String(totalAgents)}`);
    console.log(`  File cache hits:     ${String(totalBusHits)}`);
    console.log(`  File cache waits:    ${String(totalBusWaits)}`);
    console.log(`  Findings shared:     ${String(totalFindings)}`);
  }

  console.log("\n--- Per Task ---\n");
  for (const r of results) {
    const status = r.success ? "PASS" : "FAIL";
    const time = `${(r.duration / 1000).toFixed(1)}s`.padStart(7);
    const tokStr = `${((r.tokens.input + r.tokens.output) / 1000).toFixed(1)}k`.padStart(7);
    const cost = `$${estimateCost(model, r.tokens).toFixed(4)}`;
    console.log(
      `  ${status}  ${r.id.padEnd(22)} ${time}  ${String(r.steps).padStart(2)} steps  ${tokStr}  ${cost}`,
    );
    if (r.toolUses.length > 0) {
      console.log(`        ${formatToolUses(r.toolUses)}`);
    }
  }

  // Write JSON report
  const benchDir = join(cwd, "benchmarks");
  if (!existsSync(benchDir)) mkdirSync(benchDir, { recursive: true });
  const modelShort = model.split("/").pop()?.replace(/[-_]\d{8,}$/, "") ?? model;
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const reportPath = join(benchDir, `${modelShort}-${ts}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        model,
        timestamp: new Date().toISOString(),
        config: {
          maxSteps,
          repoMap: !skipRepoMap,
          subagents: true,
          promptCaching: true,
        },
        summary: {
          passed,
          failed,
          totalTime,
          totalSteps,
          totalTokens,
          estimatedCost: totalCost,
          avgTime: totalTime / results.length,
          avgSteps: totalSteps / results.length,
        },
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nReport: ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

function resetBuggyFile(dir: string) {
  writeFileSync(
    join(dir, "buggy.ts"),
    `/**
 * Returns the Nth Fibonacci number (0-indexed).
 * fib(0) = 0, fib(1) = 1, fib(5) = 5, fib(10) = 55
 */
function fib(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let a = 0;
  let b = 1;
  // BUG: loop starts at 1 instead of 2, producing off-by-one
  for (let i = 1; i < n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }
  return a; // BUG: should return b
}

console.log(\`fib(0) = \${fib(0)}\`);  // expect 0
console.log(\`fib(1) = \${fib(1)}\`);  // expect 1
console.log(\`fib(5) = \${fib(5)}\`);  // expect 5
console.log(\`fib(10) = \${fib(10)}\`); // expect 55

// Self-check
const expected = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
for (let i = 0; i <= 10; i++) {
  const got = fib(i);
  if (got !== expected[i]) {
    console.error(\`FAIL: fib(\${i}) = \${got}, expected \${expected[i]}\`);
    process.exit(1);
  }
}
console.log("All checks passed");
`,
  );
}

function resetMonolithFile(dir: string) {
  writeFileSync(
    join(dir, "monolith.ts"),
    `interface UserInput {
  name: string;
  email: string;
  age: number;
}

function validateName(name: string): string | null {
  if (!name || name.trim().length === 0) return "Name is required";
  if (name.length > 100) return "Name too long";
  if (!/^[a-zA-Z\\s'-]+$/.test(name)) return "Name contains invalid characters";
  return null;
}

function validateEmail(email: string): string | null {
  if (!email) return "Email is required";
  if (!email.includes("@")) return "Invalid email format";
  if (email.length > 254) return "Email too long";
  const [local, domain] = email.split("@");
  if (!local || !domain || !domain.includes(".")) return "Invalid email format";
  return null;
}

function validateAge(age: number): string | null {
  if (age == null) return "Age is required";
  if (!Number.isInteger(age)) return "Age must be an integer";
  if (age < 0 || age > 150) return "Age out of range";
  return null;
}

function validateUser(input: UserInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nameErr = validateName(input.name);
  if (nameErr) errors.push(nameErr);
  const emailErr = validateEmail(input.email);
  if (emailErr) errors.push(emailErr);
  const ageErr = validateAge(input.age);
  if (ageErr) errors.push(ageErr);
  return { valid: errors.length === 0, errors };
}

function createUser(input: UserInput): { id: string; name: string; email: string; age: number } {
  const result = validateUser(input);
  if (!result.valid) {
    throw new Error(\`Validation failed: \${result.errors.join(", ")}\`);
  }
  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email: input.email.toLowerCase(),
    age: input.age,
  };
}

export { createUser, validateUser, type UserInput };
`,
  );
  // Clean up validation.ts from previous runs
  try {
    const valPath = join(dir, "validation.ts");
    if (existsSync(valPath)) require("node:fs").unlinkSync(valPath);
  } catch {}
}

function writeTsConfig(dir: string): void {
  writeFileSync(
    join(dir, "tsconfig.json"),
    `{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["./**/*.ts"]
}
`,
  );
}

function resetTaskApi(dir: string) {
  const apiDir = join(dir, "task-api");
  if (!existsSync(apiDir)) mkdirSync(apiDir, { recursive: true });

  writeTsConfig(apiDir);

  writeFileSync(
    join(apiDir, "types.ts"),
    `export interface Task {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  assignee: string | null;
  priority: "low" | "medium" | "high";
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskInput {
  title: string;
  assignee?: string;
  priority?: Task["priority"];
}

export interface UpdateTaskInput {
  title?: string;
  status?: Task["status"];
  assignee?: string | null;
  priority?: Task["priority"];
}

export interface TaskStore {
  create(input: CreateTaskInput): Task;
  get(id: string): Task | null;
  list(): Task[];
  update(id: string, input: UpdateTaskInput): Task | null;
  delete(id: string): boolean;
}
`,
  );

  writeFileSync(
    join(apiDir, "store.ts"),
    `import type { CreateTaskInput, Task, TaskStore, UpdateTaskInput } from "./types.js";

export class InMemoryTaskStore implements TaskStore {
  private tasks = new Map<string, Task>();
  private seq = 0;

  create(input: CreateTaskInput): Task {
    const id = crypto.randomUUID();
    const now = Date.now() + this.seq++;
    const task: Task = {
      id,
      title: input.title,
      status: "todo",
      assignee: input.assignee ?? null,
      priority: input.priority ?? "medium",
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    return task;
  }

  get(id: string): Task | null {
    return this.tasks.get(id) ?? null;
  }

  list(): Task[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  update(id: string, input: UpdateTaskInput): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    const updated: Task = {
      ...task,
      ...input,
      updatedAt: Date.now(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }
}
`,
  );

  writeFileSync(
    join(apiDir, "service.ts"),
    `import type { CreateTaskInput, Task, TaskStore, UpdateTaskInput } from "./types.js";

export class TaskService {
  constructor(private store: TaskStore) {}

  createTask(input: CreateTaskInput): Task {
    if (!input.title || input.title.trim().length === 0) {
      throw new Error("Title is required");
    }
    if (input.title.length > 200) {
      throw new Error("Title too long (max 200 chars)");
    }
    return this.store.create({
      ...input,
      title: input.title.trim(),
    });
  }

  getTask(id: string): Task {
    const task = this.store.get(id);
    if (!task) throw new Error(\`Task \${id} not found\`);
    return task;
  }

  listTasks(): Task[] {
    return this.store.list();
  }

  updateTask(id: string, input: UpdateTaskInput): Task {
    if (input.title !== undefined && input.title.trim().length === 0) {
      throw new Error("Title cannot be empty");
    }
    const task = this.store.update(id, input);
    if (!task) throw new Error(\`Task \${id} not found\`);
    return task;
  }

  deleteTask(id: string): void {
    if (!this.store.delete(id)) {
      throw new Error(\`Task \${id} not found\`);
    }
  }
}
`,
  );

  writeFileSync(
    join(apiDir, "service.test.ts"),
    `import { describe, expect, test, beforeEach } from "bun:test";
import { InMemoryTaskStore } from "./store.js";
import { TaskService } from "./service.js";

describe("TaskService", () => {
  let service: TaskService;

  beforeEach(() => {
    service = new TaskService(new InMemoryTaskStore());
  });

  test("create and get task", () => {
    const task = service.createTask({ title: "Test task" });
    expect(task.title).toBe("Test task");
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("medium");

    const found = service.getTask(task.id);
    expect(found.id).toBe(task.id);
  });

  test("list tasks ordered by creation", () => {
    service.createTask({ title: "First" });
    service.createTask({ title: "Second" });
    const tasks = service.listTasks();
    expect(tasks.length).toBe(2);
    expect(tasks[0].title).toBe("Second");
  });

  test("update task status", () => {
    const task = service.createTask({ title: "Do thing" });
    const updated = service.updateTask(task.id, { status: "in_progress" });
    expect(updated.status).toBe("in_progress");
  });

  test("delete task", () => {
    const task = service.createTask({ title: "Delete me" });
    service.deleteTask(task.id);
    expect(() => service.getTask(task.id)).toThrow("not found");
  });

  test("rejects empty title", () => {
    expect(() => service.createTask({ title: "" })).toThrow("required");
  });

  test("filter by status", () => {
    service.createTask({ title: "A" });
    const b = service.createTask({ title: "B" });
    service.updateTask(b.id, { status: "done" });

    const done = service.listTasks({ status: "done" });
    expect(done.length).toBe(1);
    expect(done[0].title).toBe("B");
  });

  test("filter by priority", () => {
    service.createTask({ title: "Low", priority: "low" });
    service.createTask({ title: "High", priority: "high" });

    const high = service.listTasks({ priority: "high" });
    expect(high.length).toBe(1);
    expect(high[0].title).toBe("High");
  });

  test("filter by assignee", () => {
    service.createTask({ title: "A", assignee: "alice" });
    service.createTask({ title: "B", assignee: "bob" });

    const alice = service.listTasks({ assignee: "alice" });
    expect(alice.length).toBe(1);
    expect(alice[0].title).toBe("A");
  });

  test("combine filters", () => {
    const a = service.createTask({ title: "A", assignee: "alice", priority: "high" });
    service.createTask({ title: "B", assignee: "alice", priority: "low" });
    service.updateTask(a.id, { status: "in_progress" });

    const result = service.listTasks({ assignee: "alice", status: "in_progress" });
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("A");
  });

  test("empty filter returns all", () => {
    service.createTask({ title: "A" });
    service.createTask({ title: "B" });
    const all = service.listTasks({});
    expect(all.length).toBe(2);
  });
});
`,
  );
}

function resetTaskApiForRename(dir: string) {
  const apiDir = join(dir, "task-api");
  if (!existsSync(apiDir)) mkdirSync(apiDir, { recursive: true });

  writeTsConfig(apiDir);

  writeFileSync(
    join(apiDir, "types.ts"),
    `export interface Task {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  assignee: string | null;
  priority: "low" | "medium" | "high";
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskInput {
  title: string;
  assignee?: string;
  priority?: Task["priority"];
}

export interface UpdateTaskInput {
  title?: string;
  status?: Task["status"];
  assignee?: string | null;
  priority?: Task["priority"];
}

export interface TaskStore {
  create(input: CreateTaskInput): Task;
  get(id: string): Task | null;
  list(): Task[];
  update(id: string, input: UpdateTaskInput): Task | null;
  delete(id: string): boolean;
}
`,
  );

  writeFileSync(
    join(apiDir, "store.ts"),
    `import type { CreateTaskInput, Task, TaskStore, UpdateTaskInput } from "./types.js";

export class InMemoryTaskStore implements TaskStore {
  private tasks = new Map<string, Task>();
  private seq = 0;

  create(input: CreateTaskInput): Task {
    const id = crypto.randomUUID();
    const now = Date.now() + this.seq++;
    const task: Task = {
      id,
      title: input.title,
      status: "todo",
      assignee: input.assignee ?? null,
      priority: input.priority ?? "medium",
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    return task;
  }

  get(id: string): Task | null {
    return this.tasks.get(id) ?? null;
  }

  list(): Task[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  update(id: string, input: UpdateTaskInput): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    const updated: Task = {
      ...task,
      ...input,
      updatedAt: Date.now(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }
}
`,
  );

  writeFileSync(
    join(apiDir, "service.ts"),
    `import type { CreateTaskInput, Task, TaskStore, UpdateTaskInput } from "./types.js";

export class TaskService {
  constructor(private store: TaskStore) {}

  createTask(input: CreateTaskInput): Task {
    if (!input.title || input.title.trim().length === 0) {
      throw new Error("Title is required");
    }
    if (input.title.length > 200) {
      throw new Error("Title too long (max 200 chars)");
    }
    return this.store.create({
      ...input,
      title: input.title.trim(),
    });
  }

  getTask(id: string): Task {
    const task = this.store.get(id);
    if (!task) throw new Error(\`Task \${id} not found\`);
    return task;
  }

  listTasks(): Task[] {
    return this.store.list();
  }

  updateTask(id: string, input: UpdateTaskInput): Task {
    if (input.title !== undefined && input.title.trim().length === 0) {
      throw new Error("Title cannot be empty");
    }
    const task = this.store.update(id, input);
    if (!task) throw new Error(\`Task \${id} not found\`);
    return task;
  }

  deleteTask(id: string): void {
    if (!this.store.delete(id)) {
      throw new Error(\`Task \${id} not found\`);
    }
  }
}
`,
  );

  writeFileSync(
    join(apiDir, "service.test.ts"),
    `import { describe, expect, test, beforeEach } from "bun:test";
import { InMemoryTaskStore } from "./store.js";
import { TaskService } from "./service.js";

describe("TaskService", () => {
  let service: TaskService;

  beforeEach(() => {
    service = new TaskService(new InMemoryTaskStore());
  });

  test("create and get task", () => {
    const task = service.createTask({ title: "Test task" });
    expect(task.title).toBe("Test task");
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("medium");

    const found = service.getTask(task.id);
    expect(found.id).toBe(task.id);
  });

  test("list tasks ordered by creation", () => {
    service.createTask({ title: "First" });
    service.createTask({ title: "Second" });
    const tasks = service.listTasks();
    expect(tasks.length).toBe(2);
    expect(tasks[0].title).toBe("Second");
  });

  test("update task status", () => {
    const task = service.createTask({ title: "Do thing" });
    const updated = service.updateTask(task.id, { status: "in_progress" });
    expect(updated.status).toBe("in_progress");
  });

  test("delete task", () => {
    const task = service.createTask({ title: "Delete me" });
    service.deleteTask(task.id);
    expect(() => service.getTask(task.id)).toThrow("not found");
  });

  test("rejects empty title", () => {
    expect(() => service.createTask({ title: "" })).toThrow("required");
  });
});
`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});