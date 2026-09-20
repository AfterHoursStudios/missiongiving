import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Pages that must work for anyone, with no backend configured.
const PAGES = ["/", "/projects", "/about", "/legal/privacy", "/legal/ach-authorization", "/sign-in", "/register", "/reset-password", "/donate", "/unsubscribe"];

for (const path of PAGES) {
  test.describe(path, () => {
    test("renders with a single h1 and a working skip link target", async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("#main")).toHaveCount(1);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });

    test("has no WCAG 2.2 AA violations detectable by axe", async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });

    for (const [name, width, height] of [["mobile", 375, 800], ["tablet", 768, 1024], ["desktop", 1280, 800]] as const) {
      test(`does not scroll sideways on ${name}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

test("keyboard: the skip link is the first tab stop and moves focus to main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("the Donate call to action is reachable on the home page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Donate now" }).first()).toHaveAttribute("href", "/donate");
});

test("the unsubscribe page rejects an invalid link without leaking details", async ({ page }) => {
  await page.goto("/unsubscribe?t=not-a-real-token");
  await expect(page.locator("main [role=alert]")).toContainText("not valid");
  await expect(page.getByRole("button", { name: /unsubscribe/i })).toHaveCount(0);
});
