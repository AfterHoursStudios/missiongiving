const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const FREQ_SUFFIX: Record<string, string> = { monthly: "/mo", yearly: "/yr" };

export interface ExpiringCardGift { amountCents: number; frequency: string; status: string }
export interface ExpiringCardRow {
  donorId: string; donorName: string; brand: string; last4: string;
  expMonth: number; expYear: number; gifts: ExpiringCardGift[];
}

/**
 * True when a card's expiration (the last instant of its exp month, in UTC) falls at or before `windowDays`
 * from `now`. Also true for a card that has already expired — those need an even more urgent fix.
 */
export function isCardExpiringSoon(expMonth: number, expYear: number, now: Date, windowDays = 30): boolean {
  const expiryEnd = new Date(Date.UTC(expYear, expMonth, 0, 23, 59, 59, 999));
  const threshold = now.getTime() + windowDays * 86_400_000;
  return expiryEnd.getTime() <= threshold;
}

function formatGift(g: ExpiringCardGift, currency: string) {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(g.amountCents / 100);
  const suffix = FREQ_SUFFIX[g.frequency] ?? "";
  const flag = g.status === "past_due" ? " (past due)" : "";
  return `${amount}${suffix}${flag}`;
}

/** Builds the internal digest email. Returns null when there is nothing to report (caller should not send). */
export function buildExpiringCardsDigest(
  rows: ExpiringCardRow[],
  opts: { baseUrl: string; orgName: string; currency: string; windowDays: number },
): { subject: string; html: string; text: string } | null {
  if (rows.length === 0) return null;
  const { baseUrl, orgName, currency, windowDays } = opts;
  const subject = `${rows.length} recurring donor card${rows.length === 1 ? "" : "s"} expiring within ${windowDays} days`;

  const htmlRows = rows.map((r) => {
    const link = `${baseUrl}/admin/donors/${r.donorId}`;
    const gifts = r.gifts.map((g) => escapeHtml(formatGift(g, currency))).join(", ");
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5"><a href="${escapeHtml(link)}">${escapeHtml(r.donorName)}</a></td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${escapeHtml(r.brand)} &bull;&bull;&bull;&bull; ${escapeHtml(r.last4)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${String(r.expMonth).padStart(2, "0")}/${r.expYear}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${gifts}</td>
    </tr>`;
  }).join("");

  const html = `<p>The following recurring donors at ${escapeHtml(orgName)} have a card on file expiring within ${windowDays} days. Reach out or ask them to update it from their account.</p>
    <table style="border-collapse:collapse;width:100%">
      <thead><tr>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333">Donor</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333">Card</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333">Expires</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333">Recurring gift</th>
      </tr></thead>
      <tbody>${htmlRows}</tbody>
    </table>`;

  const text = [
    `The following recurring donors have a card on file expiring within ${windowDays} days:`,
    "",
    ...rows.map((r) => `- ${r.donorName}: ${r.brand} ****${r.last4}, expires ${String(r.expMonth).padStart(2, "0")}/${r.expYear} — ${r.gifts.map((g) => formatGift(g, currency)).join(", ")} — ${baseUrl}/admin/donors/${r.donorId}`),
  ].join("\n");

  return { subject, html, text };
}
