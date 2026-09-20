import PDFDocument from "pdfkit";
import { formatMoney } from "@/lib/money";
import type { Statement } from "@/lib/statements";

export interface StatementOrg { legalName: string; address: string; ein: string; phone: string; acknowledgment: string; noGoods: string }

export function renderStatementPdf(s: Statement, donorName: string, currency: string, org: StatementOrg, timeZone: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 56, bufferPages: true, info: { Title: `${s.year} Giving Statement`, Author: org.legalName } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(org.legalName);
    doc.fontSize(10).fillColor("#444").text(org.address).text(org.phone).text(org.ein ? `EIN: ${org.ein}` : "EIN: [not configured]");
    doc.moveDown(1.5).fillColor("#000").fontSize(16).text(`${s.year} Annual Giving Statement`);
    doc.fontSize(11).text(`Prepared for: ${donorName}`).moveDown();

    const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(iso));
    doc.font("Helvetica-Bold").fontSize(10).text("Date", 56, doc.y, { continued: true, width: 80 }).text("Designation", { continued: true, width: 260 }).text("Receipt", { continued: true, width: 90 }).text("Amount", { align: "right" });
    doc.font("Helvetica").moveDown(0.3);
    if (s.lines.length === 0) doc.text("No settled gifts in this year.");
    for (const l of s.lines) {
      doc.text(fmt(l.settled_at ?? l.donated_at), 56, doc.y, { continued: true, width: 80 })
        .text(l.designation, { continued: true, width: 260 })
        .text(l.receipt_number ?? "", { continued: true, width: 90 })
        .text(formatMoney(l.net_cents, currency), { align: "right" });
    }
    doc.moveDown().font("Helvetica-Bold").fontSize(12).text(`Total: ${formatMoney(s.totalCents, currency)}`, { align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#444").moveDown()
      .text("Includes only settled gifts, net of refunds. Pending, failed, canceled and disputed payments are excluded.")
      .moveDown(0.5).text(org.noGoods || "[No goods or services statement not configured]")
      .moveDown(0.5).text(org.acknowledgment || "[Acknowledgment language pending Ultimate Mission approval]");

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor("#666").text(`Page ${i + 1} of ${range.count}`, 56, 740, { align: "center", width: 500 });
    }
    doc.end();
  });
}
