import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guardrails. They can't prove the app is secure, but they stop the most common regressions: a new server action or
 * admin route added WITHOUT an authorization check, untrusted HTML rendered unsanitized, or a secret exposed to the browser.
 */
const SRC = "src";
function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => relative(".", f).split(sep).join("/");
const read = (f: string) => readFileSync(f, "utf8");

// Public-by-design server actions (they authenticate the *caller* themselves, or must work signed out).
// startCheckout: guest checkout is intentional (one-time gifts only — see its own frequency check); it still calls
// getUser() to identify an existing session when there is one, and never trusts a signed-in caller's submitted email.
const PUBLIC_ACTIONS = new Set(["registerAction", "signInAction", "magicLinkAction", "resetPasswordAction", "signOutAction", "startCheckout"]);
const GUARD = /(requirePermission|requireUser|getDonorContext|ownRecurring)\(/;

describe("every server action checks who is calling", () => {
  const actionFiles = files.filter((f) => /^\s*["']use server["']/.test(read(f)));
  it("finds the action files", () => expect(actionFiles.length).toBeGreaterThan(8));

  for (const f of actionFiles) {
    const src = read(f);
    const parts = src.split(/\nexport async function /).slice(1);
    for (const part of parts) {
      const name = part.slice(0, part.indexOf("("));
      if (PUBLIC_ACTIONS.has(name)) continue;
      it(`${rel(f)} :: ${name}`, () => expect(part, `${name} must call one of requirePermission/requireUser/getDonorContext`).toMatch(GUARD));
    }
  }
});

describe("every admin page and route enforces a permission on the server", () => {
  const admin = files.filter((f) => rel(f).startsWith("src/app/admin/") && /\/(page|route)\.tsx?$/.test(rel(f)) && !rel(f).endsWith("/forbidden/page.tsx"));
  it("finds the admin entry points", () => expect(admin.length).toBeGreaterThan(20));
  for (const f of admin) it(rel(f), () => expect(read(f)).toMatch(/(requirePermission|getStaffPermissions)\(/));
});

describe("donor and receipt endpoints require a signed-in user", () => {
  const targets = files.filter((f) => /^src\/app\/(dashboard|receipts)\/.*route\.ts$/.test(rel(f)));
  it("finds them", () => expect(targets.length).toBeGreaterThan(1));
  for (const f of targets) it(rel(f), () => expect(read(f)).toMatch(/getUser\(|getDonorContext\(/));
});

describe("machine endpoints authenticate the sender", () => {
  const expects: Record<string, RegExp> = {
    "src/app/api/webhooks/stripe/route.ts": /constructEvent\(/,
    "src/app/api/webhooks/resend/route.ts": /verifySvixSignature\(/,
    "src/app/api/cron/send-campaigns/route.ts": /isAuthorizedCron\(/,
    "src/app/api/cron/retention/route.ts": /isAuthorizedCron\(/,
    "src/app/api/cron/stripe-sync/route.ts": /isAuthorizedCron\(/,
    "src/lib/cron.ts": /timingSafeEqual\(/,
    "src/app/api/unsubscribe/route.ts": /readToken\(/,
  };
  for (const [file, re] of Object.entries(expects)) it(file, () => expect(read(file)).toMatch(re));
});

describe("untrusted HTML is sanitized before rendering", () => {
  // src/emails/campaign.tsx receives bodyHtml that renderCampaignEmail has already passed through sanitizeEmailHtml.
  const ALLOWED_UNSANITIZED = new Set(["src/emails/campaign.tsx"]);
  for (const f of files.filter((x) => read(x).includes("dangerouslySetInnerHTML"))) {
    it(rel(f), () => {
      if (ALLOWED_UNSANITIZED.has(rel(f))) return;
      expect(read(f)).toMatch(/sanitize(Story|EmailHtml)\(/);
    });
  }
  it("the campaign renderer sanitizes before handing HTML to the email layout", () => {
    expect(read("src/lib/comms/render.ts")).toMatch(/sanitizeEmailHtml\(fillTemplate\(/);
  });
});

describe("secrets never reach the browser", () => {
  it("only the four intended NEXT_PUBLIC_ variables exist", () => {
    const names = new Set<string>();
    for (const f of files) for (const m of read(f).matchAll(/NEXT_PUBLIC_[A-Z_]+/g)) names.add(m[0]);
    expect([...names].sort()).toEqual(["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  });
  it("client components never import server-only modules", () => {
    const FORBIDDEN = ["@/lib/supabase/server", "@/lib/audit", "@/lib/stripe/client", "@/lib/email", "@/lib/settings", "@/lib/comms/send", "@/lib/donor/context"];
    for (const f of files.filter((x) => /^\s*["']use client["']/.test(read(x)))) {
      for (const bad of FORBIDDEN) expect(read(f), `${rel(f)} imports ${bad}`).not.toContain(`from "${bad}"`);
    }
  });
  it("the service-role client is created only from server-only modules", () => {
    for (const f of files.filter((x) => read(x).includes("SUPABASE_SERVICE_ROLE_KEY"))) {
      expect(["src/lib/env.ts", "src/lib/supabase/server.ts"], rel(f)).toContain(rel(f));
    }
  });
  it("no source file contains what looks like a real key", () => {
    const KEY = /\b(sk_live_|sk_test_|whsec_[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{20,}|eyJhbGciOi)[A-Za-z0-9_-]*/;
    for (const f of files) expect(read(f), rel(f)).not.toMatch(KEY);
  });
});
