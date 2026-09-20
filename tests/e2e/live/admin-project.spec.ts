import { expect, test } from "@playwright/test";
import { createStaffUser, signIn, skipUnlessLive, uniqueEmail } from "./helpers";

skipUnlessLive();

test("an administrator creates and publishes a project, and it appears on the public site", async ({ page, browser }) => {
  const email = uniqueEmail("admin");
  await createStaffUser(email);
  await signIn(page, email, "/admin/projects/new");

  const title = `E2E Project ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Short summary").fill("Created by an automated test.");
  await page.getByLabel("Full story").fill("<p>Automated test story.</p>");
  await page.getByLabel("Fundraising goal (USD)").fill("1000");
  await page.getByLabel("Status").selectOption("active");
  await page.getByLabel(/^Public:/).check();
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/admin\/projects\/[0-9a-f-]{36}/);

  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto("/projects");
  await expect(pub.getByRole("heading", { name: title })).toBeVisible();
});

test("a staff member without the projects permission is refused", async ({ page }) => {
  const email = uniqueEmail("reporter");
  await createStaffUser(email, "read_only");
  await signIn(page, email, "/admin/projects");
  await expect(page).toHaveURL(/\/admin\/forbidden/);
});
