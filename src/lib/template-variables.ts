/** Merge fields a message template may use, as {{name}}. Client-safe (no sanitizer), so the editor can list them. */
export const TEMPLATE_VARIABLES = [
  "donor_first_name", "donor_full_name", "donation_amount", "donation_date", "donation_frequency",
  "tier_name", "project_name", "receipt_number", "organization_name", "dashboard_link", "receipt_link",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/** How each merge field is named in the template builder's "Insert merge field" menus. */
export const TEMPLATE_VARIABLE_LABELS: Record<TemplateVariable, string> = {
  donor_first_name: "Donor first name", donor_full_name: "Donor full name", donation_amount: "Gift amount",
  donation_date: "Gift date", donation_frequency: "Gift frequency", tier_name: "Giving level", project_name: "Designation",
  receipt_number: "Receipt number", organization_name: "Organization name", dashboard_link: "Donor dashboard link",
  receipt_link: "Receipt link",
};
