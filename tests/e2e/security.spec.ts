import { expect, test } from "@playwright/test";

test("security headers are set on public pages", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("private areas are not indexable and fail closed when signed out", async ({ page, request }) => {
  for (const p of ["/sign-in", "/register", "/unsubscribe"]) {
    expect((await request.get(p)).headers()["x-robots-tag"], p).toContain("noindex");
  }
  // No session (and here no backend at all): admin and donor areas send the visitor to sign in rather than erroring or rendering.
  for (const p of ["/admin", "/admin/donors", "/dashboard", "/dashboard/contributions"]) {
    await page.goto(p);
    await expect(page, p).toHaveURL(/\/sign-in/);
  }
});

test("robots.txt blocks private paths and lists the sitemap", async ({ request }) => {
  const txt = await (await request.get("/robots.txt")).text();
  for (const p of ["/admin", "/dashboard", "/sign-in", "/receipts", "/api"]) expect(txt).toContain(`Disallow: ${p}`);
  expect(txt).toContain("Sitemap:");
  const sm = await request.get("/sitemap.xml");
  expect(sm.status()).toBe(200);
  expect(await sm.text()).not.toContain("/admin");
});

test("data endpoints reject anonymous callers", async ({ request }) => {
  for (const p of ["/receipts/5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d/pdf", "/dashboard/export", "/admin/reports/export", "/admin/donors/export", "/admin/export/revenue"]) {
    const res = await request.get(p, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308, 401, 403], `${p} -> ${res.status()}`).toContain(res.status());
  }
});

test("webhook and cron endpoints refuse unsigned requests", async ({ request }) => {
  expect((await request.post("/api/webhooks/stripe", { data: "{}" })).status()).toBe(400);
  expect((await request.post("/api/webhooks/resend", { data: "{}" })).status()).toBe(400);
  expect((await request.get("/api/cron/send-campaigns")).status()).toBe(401);
  expect((await request.get("/api/cron/send-campaigns", { headers: { authorization: "Bearer guess" } })).status()).toBe(401);
  expect((await request.post("/api/unsubscribe?t=bogus")).status()).toBe(400);
});
