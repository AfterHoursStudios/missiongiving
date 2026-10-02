import PDFDocument from "pdfkit";
import { formatMoney } from "@/lib/money";
import { orgText } from "@/lib/statements-pdf";

export interface ReceiptData {
  receiptNumber: string; isFinal: boolean; status: string;
  donorName: string; date: string; amountCents: number; currency: string;
  designation: string; paymentMethod: string; frequency: string;
  org: { legalName: string; address: string; ein: string; phone: string; acknowledgment: string; noGoods: string };
}

const METHOD: Record<string, string> = { card: "Credit/debit card", us_bank_account: "Bank transfer (ACH)", offline: "Offline gift" };

/** Never includes card/bank details: only the payment method type. */
export function renderReceiptPdf(r: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 56, info: { Title: `Receipt ${r.receiptNumber}`, Author: r.org.legalName } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(r.org.legalName);
    doc.fontSize(10).fillColor("#444");
    // Unfilled organization details are left off (see orgText), never printed as placeholders.
    for (const line of [orgText(r.org.address), orgText(r.org.phone), orgText(r.org.ein) && `EIN: ${orgText(r.org.ein)}`]) if (line) doc.text(line);
    doc.moveDown(1.5).fillColor("#000").fontSize(16).text(r.isFinal ? "Donation Receipt" : "Donation Acknowledgment: PAYMENT PENDING");
    if (!r.isFinal) doc.fontSize(10).fillColor("#a3221a").text("This is not a final receipt. The payment has not yet settled. A final receipt is issued once it is confirmed.").fillColor("#000");
    doc.moveDown();

    const rows: [string, string][] = [
      ["Receipt number", r.receiptNumber], ["Donor", r.donorName], ["Date", r.date],
      ["Amount", formatMoney(r.amountCents, r.currency)], ["Designation", r.designation],
      ["Frequency", r.frequency], ["Payment method", METHOD[r.paymentMethod] ?? r.paymentMethod], ["Status", r.status],
    ];
    doc.fontSize(11);
    for (const [k, v] of rows) { doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(v); }

    doc.moveDown(1.5).font("Helvetica").fontSize(10);
    if (r.isFinal) {
      for (const t of [orgText(r.org.noGoods), orgText(r.org.acknowledgment)]) if (t) doc.text(t).moveDown(0.5);
    }
    doc.end();
  });
}
