// Renders a ReportDocument to a real PDF (native pdfkit document, not HTML
// screenshotted to PDF). Every page gets a header/footer with org, period,
// generation timestamp, and page number; a diagonal DRAFT watermark when
// status is "draft"; and long tables paginate with pdfkit's own page
// handling rather than overflowing silently.

import PDFDocument from "pdfkit";
import { ReportDocument, ReportSection } from "../types";

const PAGE_MARGIN = 54; // 0.75in

function drawHeaderFooter(
  doc: PDFKit.PDFDocument,
  report: ReportDocument,
  pageNumber: number,
  pageCount: number
) {
  const { width, height } = doc.page;

  doc
    .fontSize(8)
    .fillColor("#666666")
    .text(report.organizationName, PAGE_MARGIN, 24, { width: width - PAGE_MARGIN * 2, align: "left" })
    .text(report.periodLabel, PAGE_MARGIN, 24, { width: width - PAGE_MARGIN * 2, align: "right" });

  doc
    .fontSize(8)
    .fillColor("#666666")
    .text(`Generated ${report.generatedAt}`, PAGE_MARGIN, height - 36, {
      width: width - PAGE_MARGIN * 2,
      align: "left",
    })
    .text(`Page ${pageNumber} of ${pageCount}`, PAGE_MARGIN, height - 36, {
      width: width - PAGE_MARGIN * 2,
      align: "right",
    });

  doc.fillColor("#000000");
}

function drawWatermark(doc: PDFKit.PDFDocument, text: string) {
  const { width, height } = doc.page;
  doc.save();
  doc
    .rotate(-45, { origin: [width / 2, height / 2] })
    .fontSize(48)
    .fillColor("#cc0000")
    .fillOpacity(0.15)
    .text(text, 0, height / 2 - 24, { width, align: "center" });
  doc.restore();
  doc.fillOpacity(1).fillColor("#000000");
}

function renderSection(doc: PDFKit.PDFDocument, section: ReportSection) {
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor("#111111").text(section.title, { underline: false });
  doc.moveDown(0.25);
  doc.fontSize(10).fillColor("#333333");

  if (section.kind === "text") {
    doc.text(section.body, { width: doc.page.width - PAGE_MARGIN * 2 });
    return;
  }

  if (section.kind === "keyValue") {
    for (const [label, value] of section.rows) {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value);
    }
    return;
  }

  // table
  const colWidth = (doc.page.width - PAGE_MARGIN * 2) / section.headers.length;
  const startX = PAGE_MARGIN;

  const drawRow = (cells: string[], bold: boolean) => {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    cells.forEach((cell, i) => {
      doc.text(cell, startX + i * colWidth, y, { width: colWidth - 4 });
    });
    doc.moveDown(0.3);
  };

  drawRow(section.headers, true);
  doc
    .moveTo(startX, doc.y)
    .lineTo(doc.page.width - PAGE_MARGIN, doc.y)
    .strokeColor("#cccccc")
    .stroke();
  doc.moveDown(0.2);

  for (const row of section.rows) {
    if (doc.y > doc.page.height - PAGE_MARGIN - 60) {
      doc.addPage();
      drawRow(section.headers, true); // repeat headers on the new page
    }
    drawRow(row, false);
  }
}

export async function renderReportPdf(report: ReportDocument): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    bufferPages: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(20).fillColor("#111111").text(report.title, { align: "left" });
  doc.fontSize(11).fillColor("#444444").text(report.siteProgramLabel);
  doc.fontSize(9).fillColor("#666666").text(`Status: ${report.status.toUpperCase()} — v${report.version} — ${report.reportId}`);
  if (report.dataAsOfTimestamp) {
    doc.text(`Data as of: ${report.dataAsOfTimestamp}`);
  }

  for (const section of report.sections) {
    renderSection(doc, section);
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    drawHeaderFooter(doc, report, i + 1, range.count);
    if (report.watermark) {
      drawWatermark(doc, report.watermark);
    }
  }

  doc.end();
  return done;
}
