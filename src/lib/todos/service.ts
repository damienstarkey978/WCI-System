import { TodoStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class TodoNotFoundError extends Error {
  constructor(todoId: string) {
    super(`Todo ${todoId} not found`);
    this.name = "TodoNotFoundError";
  }
}

export class ChecklistItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Checklist item ${itemId} not found`);
    this.name = "ChecklistItemNotFoundError";
  }
}

export interface CreateTodoInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly priority?: "LOW" | "MEDIUM" | "HIGH";
  readonly dueDate?: Date | null;
  readonly category?: string | null;
  readonly assigneeUserId?: string | null;
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  readonly checklistItems?: readonly string[];
}

export async function createTodo(input: CreateTodoInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId } });
  if (!job) throw new JobNotFoundError(input.jobId);

  return db.todo.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "MEDIUM",
      dueDate: input.dueDate ?? null,
      category: input.category ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      clientVisible: input.clientVisible ?? false,
      subVisible: input.subVisible ?? true,
      checklistItems: {
        create: (input.checklistItems ?? []).map((title, index) => ({ title, sortOrder: index })),
      },
    },
    include: { checklistItems: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function updateTodoStatus(organizationId: string, todoId: string, status: TodoStatus) {
  const todo = await db.todo.findFirst({ where: { id: todoId, organizationId } });
  if (!todo) throw new TodoNotFoundError(todoId);
  return db.todo.update({ where: { id: todo.id }, data: { status } });
}

export async function setChecklistItemDone(organizationId: string, checklistItemId: string, isDone: boolean) {
  const item = await db.todoChecklistItem.findFirst({
    where: { id: checklistItemId, todo: { organizationId } },
  });
  if (!item) throw new ChecklistItemNotFoundError(checklistItemId);
  return db.todoChecklistItem.update({ where: { id: item.id }, data: { isDone } });
}
