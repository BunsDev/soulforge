import type { NewTaskInput, Task, TaskStore, UpdateTaskInput } from "./types.js";

export class InMemoryTaskStore implements TaskStore {
  private tasks = new Map<string, Task>();
  private seq = 0;

  create(input: NewTaskInput): Task {
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
