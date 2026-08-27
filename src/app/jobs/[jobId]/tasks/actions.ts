"use server";

import { revalidatePath } from "next/cache";

import type { TodoStatus } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { createTodo, JobNotFoundError, TodoNotFoundError, updateTodoStatus } from "@/lib/todos/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export async function createTodoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "MEDIUM");
  const dueDateRaw = String(formData.get("dueDate") ?? "");

  if (!title) {
    return { error: "Title is required." };
  }
  const priority = (PRIORITIES as readonly string[]).includes(priorityRaw)
    ? (priorityRaw as (typeof PRIORITIES)[number])
    : "MEDIUM";

  try {
    await createTodo({
      organizationId: user.organizationId,
      jobId,
      title,
      priority,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/tasks`);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function setTodoStatusAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const todoId = String(formData.get("todoId") ?? "");
  const status = String(formData.get("status") ?? "") as TodoStatus;

  try {
    await updateTodoStatus(user.organizationId, todoId, status);
  } catch (error) {
    if (error instanceof TodoNotFoundError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/tasks`);
  revalidatePath(`/jobs/${jobId}`);
}
