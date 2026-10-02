import { describe, expect, it } from "vitest";
import { TODO_TIMES, formatTodoTime } from "@/lib/admin/todos";

describe("to-do times", () => {
  it("offers 30-minute steps from 7:00 AM to 7:30 PM", () => {
    expect(TODO_TIMES[0]).toEqual(["07:00", "7:00 AM"]);
    expect(TODO_TIMES.find(([v]) => v === "12:00")?.[1]).toBe("12:00 PM");
    expect(TODO_TIMES.find(([v]) => v === "13:30")?.[1]).toBe("1:30 PM");
    expect(TODO_TIMES.at(-1)).toEqual(["19:30", "7:30 PM"]);
  });
  it("formats a stored Postgres time and tolerates none", () => {
    expect(formatTodoTime("09:30:00")).toBe("9:30 AM");
    expect(formatTodoTime(null)).toBe("");
  });
});
