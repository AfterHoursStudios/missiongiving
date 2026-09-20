import { describe, expect, it } from "vitest";
import { goalStatus, isPubliclyListed, offlineAdjustmentSchema, projectSchema, projectToRow, sanitizeStory, slugify } from "@/lib/admin/project-schema";

const base = { title: "Clean Water for Villages", status: "draft" };
const published = { ...base, status: "active", summary: "Short summary", story_html: "<p>Story</p>", is_public: "on" };

describe("slugify", () => {
  it("makes clean URL slugs", () => {
    expect(slugify("  Clean Water & Wells! ")).toBe("clean-water-wells");
    expect(slugify("Café Été")).toBe("cafe-ete");
    expect(slugify("---")).toBe("");
  });
});

describe("projectSchema", () => {
  it("generates a slug and converts the goal to cents", () => {
    const r = projectSchema.parse({ ...base, goal: "12,500.50" });
    expect(projectToRow(r)).toMatchObject({ slug: "clean-water-for-villages", goal_cents: 1250050, is_public: false, gallery: [] });
  });
  it("rejects invalid slugs, goals and inverted dates", () => {
    expect(projectSchema.safeParse({ ...base, slug: "Bad Slug!" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...base, goal: "0" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...base, start_date: "2026-06-01", end_date: "2026-05-01" }).success).toBe(false);
  });
  it("requires summary and story before publishing", () => {
    expect(projectSchema.safeParse({ ...base, status: "active" }).success).toBe(false);
    expect(projectSchema.safeParse(published).success).toBe(true);
    expect(projectSchema.safeParse({ ...published, status: "scheduled" }).success).toBe(false); // needs a start date
  });
  it("accepts only https images and at most 10 gallery images", () => {
    expect(projectSchema.safeParse({ ...base, featured_image_url: "http://x.test/a.jpg" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...base, gallery: "https://x.test/a.jpg\njavascript:alert(1)" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...base, gallery: Array(11).fill("https://x.test/a.jpg").join("\n") }).success).toBe(false);
  });
  it("sanitizes story HTML", () => {
    const r = projectSchema.parse({ ...published, story_html: '<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><img src=x onerror=alert(1)>' });
    expect(r.story_html).not.toMatch(/script|onclick|javascript:|onerror|<img/i);
    expect(sanitizeStory('<a href="https://ok.test">ok</a>')).toContain('rel="noopener noreferrer"');
  });
});

describe("visibility and goals", () => {
  it("lists only public projects in a publishable status", () => {
    expect(isPubliclyListed({ is_public: true, status: "active" })).toBe(true);
    expect(isPubliclyListed({ is_public: true, status: "draft" })).toBe(false);
    expect(isPubliclyListed({ is_public: false, status: "active" })).toBe(false);
    expect(isPubliclyListed({ is_public: true, status: "archived" })).toBe(false);
  });
  it("moves active projects to goal_reached, and never changes other statuses", () => {
    expect(goalStatus("active", 100000, 100000)).toBe("goal_reached");
    expect(goalStatus("active", 99999, 100000)).toBe("active");
    expect(goalStatus("active", 5, null)).toBe("active");
    expect(goalStatus("completed", 999999, 100000)).toBe("completed");
  });
});

describe("offline adjustments", () => {
  it("requires an explanation and supports negative corrections", () => {
    expect(offlineAdjustmentSchema.safeParse({ id: "5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d", amount: "250", note: "" }).success).toBe(false);
    expect(offlineAdjustmentSchema.parse({ id: "5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d", amount: "-50.25", note: "Correcting a typo" }).amount).toBe(-5025);
  });
});
