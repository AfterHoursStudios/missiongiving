import { z } from "zod";
import { dollarsToCents } from "@/lib/money";

export const PAYMENT_METHODS = ["check", "ach", "card", "cash", "wire", "other"] as const;

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
export const expenseSchema = z.object({
  expense_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date").refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  vendor: z.string().trim().min(1, "Enter the vendor").max(120),
  description: text(500),
  amount: z.string().trim().transform((v, ctx) => {
    try { const c = dollarsToCents(v); if (c <= 0) throw new Error(); return c; } catch { ctx.addIssue({ code: "custom", message: "Enter an amount like 125.50" }); return z.NEVER; }
  }),
  category_id: z.string().uuid("Choose a category"),
  project_id: z.string().trim().optional().transform((v) => v || null).pipe(z.string().uuid().nullable()),
  restriction: z.enum(["restricted", "unrestricted"]),
  payment_method: z.enum(PAYMENT_METHODS).optional().or(z.literal("").transform(() => undefined)),
  reference_number: text(60), notes: text(2000),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export function expenseToRow(e: ExpenseInput) {
  return {
    expense_date: e.expense_date, vendor: e.vendor, description: e.description, amount_cents: e.amount, category_id: e.category_id,
    project_id: e.project_id, restriction: e.restriction, payment_method: e.payment_method ?? null, reference_number: e.reference_number, notes: e.notes,
  };
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export type UploadKind = { ext: "pdf" | "png" | "jpg" | "webp"; mime: string };

/**
 * Identifies an upload by its CONTENT (magic bytes), never by the filename or browser-reported type, and enforces the size limit.
 * The stored filename is generated server-side, so the original name is never trusted or used in paths.
 */
export function sniffUpload(bytes: Uint8Array): UploadKind | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (bytes.length < 12) return null;
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return { ext: "pdf", mime: "application/pdf" };
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", mime: "image/png" };
  if (startsWith(0xff, 0xd8, 0xff)) return { ext: "jpg", mime: "image/jpeg" };
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { ext: "webp", mime: "image/webp" };
  return null;
}
export function validateUpload(bytes: Uint8Array): { ok: true; kind: UploadKind } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "The file is larger than 5 MB." };
  const kind = sniffUpload(bytes);
  return kind ? { ok: true, kind } : { ok: false, error: "Attach a PDF, PNG, JPEG or WebP file." };
}

/** Separation of duties: finance approval is required, and people don't approve their own entries (Super Admins excepted, and audited). */
export function canApproveExpense(a: { actorId: string; creatorId: string | null; hasFinanceView: boolean; isSuperAdmin: boolean }): { ok: boolean; reason?: string } {
  if (!a.hasFinanceView) return { ok: false, reason: "Approving expenses requires finance access." };
  if (a.creatorId && a.creatorId === a.actorId && !a.isSuperAdmin) return { ok: false, reason: "Someone else must approve an expense you entered." };
  return { ok: true };
}

/** Editing an approved expense sends it back for approval so approved figures can't be silently changed. */
export const approvalAfterEdit = (current: string) => (current === "approved" ? "pending" : current === "rejected" ? "pending" : current);
