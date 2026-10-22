/**
 * Fonts offered in the template builder. Email apps (Gmail, Outlook) ignore web fonts, so these are fonts installed on
 * most computers and phones, each with fallbacks for devices that lack it. Client-safe: the editor and sanitizer share it.
 */
export const EMAIL_FONTS = [
  { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", stack: "Georgia, serif" },
  { label: "Times New Roman", stack: "Times New Roman, Times, serif" },
  { label: "Garamond", stack: "Garamond, Georgia, serif" },
  { label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", stack: "Tahoma, Verdana, sans-serif" },
  { label: "Trebuchet MS", stack: "Trebuchet MS, Helvetica, sans-serif" },
  { label: "Courier New", stack: "Courier New, Courier, monospace" },
  { label: "Brush Script (handwriting)", stack: "Brush Script MT, cursive" },
] as const;

/** Compares font-family values ignoring quotes and spacing, since browsers may add quotes around multi-word names. */
export const normalizeFontStack = (v: string) => v.replace(/["']/g, "").split(",").map((f) => f.trim().replace(/\s+/g, " ")).join(", ");

/** Matches exactly one of EMAIL_FONTS' stacks, with or without quotes around each name (for the email sanitizer). */
export const EMAIL_FONT_PATTERNS: RegExp[] = EMAIL_FONTS.map((f) => new RegExp(
  `^${f.stack.split(", ").map((name) => `["']?${name.replace(/ /g, "\\s+")}["']?`).join("\\s*,\\s*")}$`, "i"));
