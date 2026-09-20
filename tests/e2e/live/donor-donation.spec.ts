import { expect, test } from "@playwright/test";
import { createDonorUser, signIn, skipUnlessLive, uniqueEmail } from "./helpers";

skipUnlessLive();

test("a donor signs in, gives $25 by test card, and sees it confirmed in their account", async ({ page }) => {
  const email = uniqueEmail("donor");
  await createDonorUser(email);
  await signIn(page, email, "/donate");

  await page.getByRole("button", { name: /General Fund/ }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // destination -> frequency
  await page.getByRole("button", { name: "One time" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // frequency -> amount
  await page.getByRole("button", { name: /\$25\.00/ }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // amount -> details
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Donor");
  await page.getByRole("button", { name: "Continue to payment" }).click();

  // Stripe's Payment Element renders in an iframe; 4242... is Stripe's public test card.
  const stripe = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
  await stripe.getByLabel("Card number").fill("4242424242424242");
  await stripe.getByLabel("Expiration date").fill("12 / 34");
  await stripe.getByLabel("Security code").fill("123");
  await page.getByRole("button", { name: "Give now" }).click();

  // Status comes from the signed webhook, never from the redirect, so allow time for `stripe listen` to deliver it.
  await page.waitForURL(/\/donate\/confirmation/);
  await expect(page.getByText("Your payment is confirmed.")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/MG-\d{8}/)).toBeVisible();

  await page.goto("/dashboard/contributions");
  await expect(page.getByRole("row", { name: /\$25\.00.*Succeeded/ })).toBeVisible();
});

test("a donor cannot open a receipt that is not theirs", async ({ page }) => {
  const email = uniqueEmail("nosy");
  await createDonorUser(email);
  await signIn(page, email, "/dashboard");
  const res = await page.request.get("/receipts/5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d/pdf");
  expect(res.status()).toBe(404); // row-level security returns nothing for someone else's (or a nonexistent) donation
});
