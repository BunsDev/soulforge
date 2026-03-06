import type { NewTaskInput, Task, TaskStore, UpdateTaskInput } from "./types.js";

export class TaskService {
  constructor(private store: TaskStore) {}

  createTask(input: NewTaskInput): Task {
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
    if (!task) throw new Error(`Task ${id} not found`);
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
    if (!task) throw new Error(`Task ${id} not found`);
    return task;
  }

  deleteTask(id: string): void {
    if (!this.store.delete(id)) {
      throw new Error(`Task ${id} not found`);
    }
  }
}
