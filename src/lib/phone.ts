/**
 * Shows a US/Canada (NANP) phone number in national format, "(503) 680-0290", keeping any extension
 * ("ext. 12"). Numbers that aren't 10 digits (or 11 starting with 1) are returned as entered, so
 * international numbers are never mangled. Display only; stored values are untouched.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const input = raw.trim();
  const ext = /\s*(?:x|ext\.?|extension)\s*(\d{1,6})\s*$/i.exec(input);
  const main = ext ? input.slice(0, ext.index) : input;
  if (main.startsWith("+") && !main.startsWith("+1")) return input; // another country's number
  let digits = main.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return input;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}${ext ? ` ext. ${ext[1]}` : ""}`;
}
