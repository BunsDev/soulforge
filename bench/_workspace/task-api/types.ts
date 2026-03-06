export interface Task {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  assignee: string | null;
  priority: "low" | "medium" | "high";
  createdAt: number;
  updatedAt: number;
}

export interface NewTaskInput {
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
  create(input: NewTaskInput): Task;
  get(id: string): Task | null;
  list(): Task[];
  update(id: string, input: UpdateTaskInput): Task | null;
  delete(id: string): boolean;
}
