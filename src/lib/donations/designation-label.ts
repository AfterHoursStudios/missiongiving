/**
 * The designation donors see for a gift (forms, thank-you page, receipts, emails, statements). Sponsored women are
 * never named there: a sponsorship gift reads "Sponsorship". Staff still see her name in the admin.
 */
export const SPONSORSHIP_LABEL = "Sponsorship";

export function donorFacingDesignation(project: { title: string; kind?: string | null } | null | undefined): string {
  if (!project) return "General Fund";
  return project.kind === "sponsorship" ? SPONSORSHIP_LABEL : project.title;
}
