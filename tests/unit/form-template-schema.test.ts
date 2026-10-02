import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, formTemplateSchema } from "@/lib/admin/form-template-schema";

describe("formTemplateSchema", () => {
  it("accepts the default template", () => {
    expect(formTemplateSchema.safeParse(DEFAULT_TEMPLATE).success).toBe(true);
  });
  it("rejects a color that isn't #rrggbb", () => {
    const bad = { ...DEFAULT_TEMPLATE, accent_color: "green" };
    expect(formTemplateSchema.safeParse(bad).success).toBe(false);
  });
  it("requires at least one giving frequency", () => {
    const bad = { ...DEFAULT_TEMPLATE, allow_one_time: false, allow_monthly: false, allow_yearly: false };
    const r = formTemplateSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });
  it("rejects a block missing its text", () => {
    const bad = { ...DEFAULT_TEMPLATE, blocks: [{ type: "headline", text: "" }] };
    expect(formTemplateSchema.safeParse(bad).success).toBe(false);
  });
  it("accepts an image block with a url", () => {
    const ok = { ...DEFAULT_TEMPLATE, blocks: [{ type: "image", url: "/images/hero.jpg" }] };
    expect(formTemplateSchema.safeParse(ok).success).toBe(true);
  });
});
