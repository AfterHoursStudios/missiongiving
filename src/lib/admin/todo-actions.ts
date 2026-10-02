"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { TODO_ACTIVITIES, TODO_TIMES } from "./todos";

type State = { ok?: boolean; error?: string; message?: string } | undefined;
const uuid = z.string().uuid();

const createSchema = z.object({
  donorId: uuid,
  activity: z.enum(Object.keys(TODO_ACTIVITIES) as [keyof typeof TODO_ACTIVITIES, ...(keyof typeof TODO_ACTIVITIES)[]], { message: "Choose an activity" }),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
  dueTime: z.string().optional().refine((t) => !t || TODO_TIMES.some(([v]) => v === t), "Choose a valid time"),
  assignedTo: uuid.or(z.literal("")).refine((v) => v !== "", "Choose who it's assigned to"),
  notes: z.string().trim().max(2000).optional(),
});

/** Creates a follow-up to-do for one donor, assigned to an active staff member. */
export async function createTodo(_: State, form: FormData): Promise<State> {
  const { user } = await requirePermission("donors.edit");
  const p = createSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const db = createSupabaseAdminClient();
  const [{ data: donor }, { data: staff }] = await Promise.all([
    db.from("donor_profiles").select("id").eq("id", p.data.donorId).is("deleted_at", null).maybeSingle(),
    db.from("staff_profiles").select("user_id").eq("user_id", p.data.assignedTo).eq("active", true).maybeSingle(),
  ]);
  if (!donor) return { error: "Donor not found." };
  if (!staff) return { error: "Choose an active staff member." };
  const { error } = await db.from("donor_todos").insert({
    donor_id: donor.id, activity: p.data.activity, due_date: p.data.dueDate, due_time: p.data.dueTime || null,
    assigned_to: p.data.assignedTo, notes: p.data.notes || null, created_by: user.id,
  });
  if (error) return { error: "Could not save the to-do." };
  await audit(user.id, "donor.update", "donor", donor.id, { field: "todo_created" });
  revalidatePath(`/admin/donors/${donor.id}`);
  revalidatePath("/admin");
  return { ok: true, message: "To-do saved." };
}

/** Marks a to-do done (or reopens it). */
export async function setTodoDone(_: State, form: FormData): Promise<State> {
  const { user } = await requirePermission("donors.edit");
  const p = z.object({ id: uuid, done: z.enum(["1", "0"]) }).safeParse({ id: form.get("id"), done: form.get("done") });
  if (!p.success) return { error: "To-do not found." };
  const db = createSupabaseAdminClient();
  const done = p.data.done === "1";
  const { data, error } = await db.from("donor_todos")
    .update({ completed_at: done ? new Date().toISOString() : null, completed_by: done ? user.id : null })
    .eq("id", p.data.id).select("donor_id").maybeSingle();
  if (error || !data) return { error: "To-do not found." };
  if (data.donor_id) {
    await audit(user.id, "donor.update", "donor", data.donor_id, { field: done ? "todo_completed" : "todo_reopened" });
    revalidatePath(`/admin/donors/${data.donor_id}`);
  }
  revalidatePath("/admin");
  return { ok: true, message: done ? "Marked done." : "Reopened." };
}

const staffTodoSchema = z.object({
  title: z.string().trim().min(1, "Describe the to-do").max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
  dueTime: z.string().optional().refine((t) => !t || TODO_TIMES.some(([v]) => v === t), "Choose a valid time"),
  assignedTo: uuid.or(z.literal("")).refine((v) => v !== "", "Choose who it's assigned to"),
  notes: z.string().trim().max(2000).optional(),
});

/** A staff to-do not tied to any donor (Add New → To-do). Shows in the assignee's "My to-dos" on the dashboard. */
export async function createStaffTodo(_: State, form: FormData): Promise<State> {
  const { user } = await requirePermission("donors.edit");
  const p = staffTodoSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const db = createSupabaseAdminClient();
  const { data: staff } = await db.from("staff_profiles").select("user_id").eq("user_id", p.data.assignedTo).eq("active", true).maybeSingle();
  if (!staff) return { error: "Choose an active staff member." };
  const { error } = await db.from("donor_todos").insert({
    donor_id: null, activity: "task", title: p.data.title, due_date: p.data.dueDate, due_time: p.data.dueTime || null,
    assigned_to: p.data.assignedTo, notes: p.data.notes || null, created_by: user.id,
  });
  if (error) return { error: "Could not save the to-do. (Has database migration 0019 been applied?)" };
  revalidatePath("/admin");
  return { ok: true, message: "To-do saved." };
}
