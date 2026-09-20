import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, approvalAfterEdit, canApproveExpense, expenseSchema, expenseToRow, validateUpload } from "@/lib/admin/expense-logic";

const cat = "5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d";
const valid = { expense_date: "2026-03-01", vendor: "Acme Supplies", amount: "125.50", category_id: cat, restriction: "unrestricted" };
const bytes = (...b: number[]) => new Uint8Array([...b, ...Array(20).fill(0)]);

describe("expenseSchema", () => {
  it("converts to cents and defaults optional fields", () => {
    expect(expenseToRow(expenseSchema.parse(valid))).toMatchObject({ amount_cents: 12550, project_id: null, payment_method: null, description: null });
  });
  it("rejects bad input", () => {
    for (const bad of [{ amount: "0" }, { amount: "-5" }, { amount: "abc" }, { vendor: " " }, { expense_date: "3/1/26" }, { category_id: "x" }, { restriction: "maybe" }, { payment_method: "bitcoin" }])
      expect(expenseSchema.safeParse({ ...valid, ...bad }).success, JSON.stringify(bad)).toBe(false);
  });
  it("ignores fields a client should not set (approval, creator)", () => {
    const row = expenseToRow(expenseSchema.parse({ ...valid, approval: "approved", approved_by: "x", created_by: "y" }));
    expect(row).not.toHaveProperty("approval");
    expect(row).not.toHaveProperty("approved_by");
  });
});

describe("upload validation", () => {
  it("accepts PDF, PNG, JPEG and WebP by content", () => {
    expect(validateUpload(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toMatchObject({ ok: true, kind: { ext: "pdf" } });
    expect(validateUpload(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toMatchObject({ ok: true, kind: { ext: "png" } });
    expect(validateUpload(bytes(0xff, 0xd8, 0xff, 0xe0))).toMatchObject({ ok: true, kind: { ext: "jpg" } });
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
    expect(validateUpload(webp)).toMatchObject({ ok: true, kind: { ext: "webp" } });
  });
  it("rejects disguised or dangerous files regardless of name", () => {
    expect(validateUpload(new TextEncoder().encode("<html><script>alert(1)</script></html>"))).toMatchObject({ ok: false });
    expect(validateUpload(new TextEncoder().encode("MZ\u0090\u0000\u0003 executable bytes here"))).toMatchObject({ ok: false });
    expect(validateUpload(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg' onload='x()'/>"))).toMatchObject({ ok: false });
    expect(validateUpload(new Uint8Array())).toMatchObject({ ok: false });
  });
  it("enforces the 5 MB limit", () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1); big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(validateUpload(big)).toMatchObject({ ok: false, error: expect.stringContaining("5 MB") });
  });
});

describe("approval rules", () => {
  it("requires finance access and a second person, except Super Admins", () => {
    expect(canApproveExpense({ actorId: "a", creatorId: "b", hasFinanceView: true, isSuperAdmin: false }).ok).toBe(true);
    expect(canApproveExpense({ actorId: "a", creatorId: "a", hasFinanceView: true, isSuperAdmin: false }).ok).toBe(false);
    expect(canApproveExpense({ actorId: "a", creatorId: "a", hasFinanceView: true, isSuperAdmin: true }).ok).toBe(true);
    expect(canApproveExpense({ actorId: "a", creatorId: "b", hasFinanceView: false, isSuperAdmin: true }).ok).toBe(false);
  });
  it("sends edited approved or rejected expenses back to pending", () => {
    expect(approvalAfterEdit("approved")).toBe("pending");
    expect(approvalAfterEdit("rejected")).toBe("pending");
    expect(approvalAfterEdit("pending")).toBe("pending");
  });
});
