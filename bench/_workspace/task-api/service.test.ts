import { describe, expect, test, beforeEach } from "bun:test";
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
