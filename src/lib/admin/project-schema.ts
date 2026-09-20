import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { dollarsToCents } from "@/lib/money";

export const PROJECT_STATUSES = ["draft", "scheduled", "active", "goal_reached", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function slugify(input: string): string {
  return input.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/** Story markup is limited to basic text formatting and links; scripts, styles, event handlers and javascript: URLs are removed. */
export function sanitizeStory(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "h2", "h3", "a", "blockquote"],
    allowedAttributes: { a: ["href", "title", "rel", "target"] },
    allowedSchemes: ["https", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }) },
  });
}

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const httpsUrl = z.string().trim().optional().transform((v) => v || null).refine((v) => v === null || /^https:\/\/[^\s]+$/.test(v), "Image URLs must start with https://");
const date = z.string().trim().optional().transform((v, ctx) => {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) { ctx.addIssue({ code: "custom", message: "Enter a valid date" }); return z.NEVER; }
  return v;
});

export const projectSchema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(120),
  slug: z.string().trim().toLowerCase().optional(),
  summary: text(300),
  story_html: z.string().max(50_000).optional().transform((v) => (v ? sanitizeStory(v) : null)),
  featured_image_url: httpsUrl,
  gallery: z.string().optional().transform((v, ctx) => {
    const urls = (v ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (urls.length > 10) { ctx.addIssue({ code: "custom", message: "Use at most 10 gallery images" }); return z.NEVER; }
    if (urls.some((u) => !/^https:\/\/[^\s]+$/.test(u))) { ctx.addIssue({ code: "custom", message: "Gallery image URLs must start with https://" }); return z.NEVER; }
    return urls;
  }),
  location: text(120),
  goal: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    try { const c = dollarsToCents(v); if (c <= 0) throw new Error(); return c; } catch { ctx.addIssue({ code: "custom", message: "Enter a goal like 10000 or 10000.00" }); return z.NEVER; }
  }),
  start_date: date, end_date: date,
  status: z.enum(PROJECT_STATUSES),
  featured: checkbox, is_public: checkbox, allow_custom_amount: checkbox,
  seo_title: text(70), seo_description: text(160), share_image_url: httpsUrl,
}).transform((v) => ({ ...v, slug: v.slug ? v.slug : slugify(v.title) }))
  .superRefine((v, ctx) => {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug)) ctx.addIssue({ code: "custom", path: ["slug"], message: "Slug may only contain lowercase letters, numbers and hyphens" });
    if (v.start_date && v.end_date && v.end_date < v.start_date) ctx.addIssue({ code: "custom", path: ["end_date"], message: "End date must be on or after the start date" });
    if (["scheduled", "active", "goal_reached", "completed"].includes(v.status)) {
      if (!v.summary) ctx.addIssue({ code: "custom", path: ["summary"], message: "Add a short summary before publishing" });
      if (!v.story_html) ctx.addIssue({ code: "custom", path: ["story_html"], message: "Add the project story before publishing" });
    }
    if (v.status === "scheduled" && !v.start_date) ctx.addIssue({ code: "custom", path: ["start_date"], message: "A scheduled project needs a start date" });
  });
export type ProjectInput = z.infer<typeof projectSchema>;

export function projectToRow(p: ProjectInput) {
  return {
    title: p.title, slug: p.slug, summary: p.summary, story_html: p.story_html, featured_image_url: p.featured_image_url,
    gallery: p.gallery, location: p.location, goal_cents: p.goal, start_date: p.start_date, end_date: p.end_date,
    status: p.status, featured: p.featured, is_public: p.is_public, allow_custom_amount: p.allow_custom_amount,
    seo_title: p.seo_title, seo_description: p.seo_description, share_image_url: p.share_image_url,
  };
}

/** Public visibility: a project is shown only when explicitly public AND in a publishable status. */
export const isPubliclyListed = (p: { is_public: boolean; status: string }) =>
  p.is_public && ["active", "goal_reached", "completed"].includes(p.status);

/** Should an active project be marked goal-reached? Never reverts on its own. */
export function goalStatus(status: string, raisedCents: number, goalCents: number | null): string {
  return status === "active" && goalCents !== null && raisedCents >= goalCents ? "goal_reached" : status;
}

export const offlineAdjustmentSchema = z.object({
  id: z.string().uuid(),
  amount: z.string().trim().transform((v, ctx) => {
    const neg = v.startsWith("-");
    try { const c = dollarsToCents(neg ? v.slice(1) : v); return neg ? -c : c; } catch { ctx.addIssue({ code: "custom", message: "Enter an amount like 250 or -50" }); return z.NEVER; }
  }),
  note: z.string().trim().min(5, "Explain the adjustment (at least a few words)").max(500),
});
