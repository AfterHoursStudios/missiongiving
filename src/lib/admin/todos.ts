/** Outreach activities a to-do can be. Keys match the donor_todos.activity check constraint (migration 0014). */
export const TODO_ACTIVITIES = {
  thank_you_call: "Thank-you call", phone_call: "Phone call", send_letter: "Send a letter", send_email: "Send an email",
  meeting: "Meeting / visit", follow_up: "Follow up", other: "Other",
} as const;
/** Label for a staff to-do (no donor); its own title is shown instead where available. */
export const STAFF_TODO_LABEL = "To-do";
export type TodoActivity = keyof typeof TODO_ACTIVITIES;

/** Optional due times in 30-minute steps, 7:00 AM to 7:30 PM, as [value "HH:MM", label]. */
export const TODO_TIMES: [string, string][] = Array.from({ length: 26 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  const h = Math.floor(mins / 60), m = mins % 60;
  return [`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`];
});

export function formatTodoTime(t: string | null): string {
  if (!t) return "";
  return TODO_TIMES.find(([v]) => v === t.slice(0, 5))?.[1] ?? t.slice(0, 5);
}
