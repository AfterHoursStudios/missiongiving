import PDFDocument from "pdfkit";
import { DISCLAIMER, cell, type Section } from "./sections";

export interface PdfMeta { orgName: string; title: string; filters: string[]; generatedAt: string; currency: string }

const M = 48, W = 612 - M * 2, BOTTOM = 792 - 64;

/** Professional PDF: org name, title, period and filters, generation date, tables, disclaimer, "Page X of Y" on every page. */
export function renderReportPdf(meta: PdfMeta, sections: Section[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: M, bufferPages: true, info: { Title: `${meta.orgName} - ${meta.title}`, Author: meta.orgName } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text(meta.orgName, M, M);
    doc.fontSize(14).text(meta.title);
    doc.font("Helvetica").fontSize(9).fillColor("#333");
    for (const f of meta.filters) doc.text(f);
    doc.text(`Generated: ${meta.generatedAt}`).moveDown(0.5);
    doc.fillColor("#7a1f16").text(`Note: ${DISCLAIMER}`, { width: W }).fillColor("#000").moveDown();

    for (const s of sections) {
      if (doc.y > BOTTOM - 80) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(12).text(s.title, M, doc.y);
      if (s.note) doc.font("Helvetica-Oblique").fontSize(8).fillColor("#444").text(s.note, { width: W }).fillColor("#000");
      doc.moveDown(0.3);
      const first = 170, rest = (W - first) / Math.max(1, s.columns.length - 1);
      const widths = s.columns.map((_, i) => (i === 0 ? first : rest));
      const drawRow = (vals: string[], bold: boolean) => {
        if (doc.y > BOTTOM - 14) doc.addPage();
        const y = doc.y;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
        let x = M;
        vals.forEach((v, i) => { doc.text(v, x, y, { width: widths[i] - 4, align: i === 0 ? "left" : "right", lineBreak: false, ellipsis: true }); x += widths[i]; });
        doc.y = y + 12;
      };
      drawRow(s.columns, true);
      doc.moveTo(M, doc.y - 1).lineTo(M + W, doc.y - 1).strokeColor("#888").stroke().strokeColor("#000");
      if (s.rows.length === 0) drawRow(["No data"], false);
      for (const r of s.rows) drawRow(r.map((v, i) => cell(v, s.money.includes(i), meta.currency)), /^(Net |Total|Change)/.test(String(r[0])));
      doc.moveDown(0.8);
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8).fillColor("#666").text(`${meta.orgName} · ${meta.title} · Page ${i + 1} of ${range.count}`, M, 792 - 40, { width: W, align: "center", lineBreak: false });
    }
    doc.end();
  });
}
