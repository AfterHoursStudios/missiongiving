import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createStaffUser, signIn, skipUnlessLive, uniqueEmail } from "./helpers";

skipUnlessLive();

test("a finance user views the P&L and downloads it as CSV and PDF", async ({ page }) => {
  const email = uniqueEmail("finance");
  await createStaffUser(email, "finance_admin");
  await signIn(page, email, "/admin/reports");

  await expect(page.getByRole("heading", { name: "Financial reports" })).toBeVisible();
  await expect(page.getByText(/reviewed by Ultimate Mission's accountant/)).toBeVisible();

  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^management-pl-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(readFileSync(await csv.path(), "utf8")).toContain("Management Profit & Loss");

  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download PDF" }).click()]);
  expect(readFileSync(await pdf.path()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("a read-only reporter can view reports but cannot see the donor filter", async ({ page }) => {
  const email = uniqueEmail("reporter");
  await createStaffUser(email, "read_only");
  await signIn(page, email, "/admin/reports");
  await expect(page.getByRole("heading", { name: "Financial reports" })).toBeVisible();
  await expect(page.getByLabel("Donor email")).toHaveCount(0);
});
