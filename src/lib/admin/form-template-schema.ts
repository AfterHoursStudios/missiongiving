import { z } from "zod";

/**
 * A donation form template controls PRESENTATION only: branding, decorative content blocks, which optional donor
 * fields to collect, which frequencies to offer, and the submit button's label. It never controls amounts, tiers,
 * sponsorships or payment — those stay exactly as resolved by the server today, regardless of the template shown.
 */
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("headline"), text: z.string().trim().min(1, "Enter the headline text").max(150) }),
  z.object({ type: z.literal("section_header"), text: z.string().trim().min(1, "Enter the section header text").max(120) }),
  z.object({ type: z.literal("description"), text: z.string().trim().min(1, "Enter the description text").max(2000) }),
  z.object({ type: z.literal("image"), url: z.string().trim().min(1, "Choose an image"), alt: z.string().trim().max(200).optional() }),
]);
export type FormBlock = z.infer<typeof blockSchema>;
export const BLOCK_LABELS: Record<FormBlock["type"], string> = {
  headline: "Headline", section_header: "Section header", description: "Description text", image: "Image",
};

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Enter a color as #rrggbb");

export const formTemplateSchema = z.object({
  name: z.string().trim().min(1, "Enter a name for this form").max(80),
  status: z.enum(["active", "archived"]),
  background_color: hex,
  accent_color: hex,
  blocks: z.array(blockSchema).max(20),
  show_phone: z.boolean(), show_address: z.boolean(), show_organization: z.boolean(), show_dedication: z.boolean(),
  allow_one_time: z.boolean(), allow_monthly: z.boolean(), allow_yearly: z.boolean(),
  submit_label: z.string().trim().min(1, "Enter the button label").max(40),
}).refine((v) => v.allow_one_time || v.allow_monthly || v.allow_yearly, { message: "Offer at least one giving frequency", path: ["allow_one_time"] });
export type FormTemplateInput = z.infer<typeof formTemplateSchema>;

export interface FormTemplateRow extends FormTemplateInput {
  id: string;
  is_default: boolean;
}

export const DEFAULT_TEMPLATE: FormTemplateInput = {
  name: "New form", status: "active", background_color: "#f4f1ea", accent_color: "#15642f",
  blocks: [{ type: "headline", text: "Your gift changes a life" }],
  show_phone: true, show_address: false, show_organization: false, show_dedication: true,
  allow_one_time: true, allow_monthly: true, allow_yearly: false,
  submit_label: "Give now",
};
