import { dmy, type RemitLine, type RemitSummary, type StockRow } from "@/lib/calc";

// jsPDF's built-in fonts have no ₦ glyph, so amounts print as "NGN 12,000".
const N = (v: number) => "NGN " + Math.round(v).toLocaleString("en-NG");

/** Builds the remittance PDF in the browser and downloads it. jsPDF loads only when needed. */
export async function buildRemitPdf(merchantName: string, date: string, s: RemitSummary, note: string, lines: RemitLine[], stock: StockRow[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFillColor(12, 20, 16);
  doc.rect(0, 0, 595, 80, "F");
  // The Meld mark, scaled from its 100-unit viewBox.
  const k = 0.4;
  const P = (x: number, y: number): [number, number] => [40 + x * k, 20 + y * k];
  const c0 = P(50, 50);
  doc.setLineWidth(1.8);
  for (const [x, y, c] of [
    [14, 26, [46, 107, 79]],
    [86, 26, [63, 138, 102]],
    [14, 74, [46, 107, 79]],
    [86, 74, [63, 138, 102]],
  ] as const) {
    doc.setDrawColor(c[0], c[1], c[2]);
    const a = P(x, y);
    doc.line(a[0], a[1], c0[0], c0[1]);
  }
  doc.setFillColor(125, 217, 87);
  for (const [x, y] of [[14, 26], [86, 26], [14, 74], [86, 74]] as const) {
    const a = P(x, y);
    doc.circle(a[0], a[1], 6.5 * k, "F");
  }
  doc.setFillColor(182, 245, 66);
  doc.circle(c0[0], c0[1], 16 * k, "F");
  doc.setLineWidth(0.75);

  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.text("MELD", 90, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("MELD Logistics Company Ltd", 555, 44, { align: "right" });

  doc.setTextColor(12, 20, 16);
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text("Remittance report", 40, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${merchantName}  |  ${dmy(date)}`, 40, 140);

  let y = 172;
  const row = (a: string, b: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(a, 40, y);
    doc.text(b, 555, y, { align: "right" });
    y += 20;
  };
  row("Money received", N(s.received));
  row("Units delivered", String(s.units));
  row("Delivery fees", "- " + N(s.deliveryFees));
  row("Waybill charges", "- " + N(s.waybillFees));
  row("Failed fees (50%)", "- " + N(s.failedFees));
  row("Other deductions" + (note ? ` (${note})` : ""), "- " + N(s.other));
  doc.setDrawColor(46, 107, 79);
  doc.line(40, y - 8, 555, y - 8);
  y += 8;
  doc.setFontSize(14);
  row("Expected remittance", N(s.expected), true);

  if (stock.length) {
    y += 12;
    doc.setFontSize(12);
    doc.setFont("times", "bold");
    doc.text("Stock remaining with Meld", 40, y);
    y += 18;
    doc.setFontSize(11);
    for (const r of stock) {
      if (y > 800) {
        doc.addPage();
        y = 50;
      }
      row(r.product.slice(0, 60), `${r.stock} unit${r.stock === 1 ? "" : "s"}`);
    }
  }

  doc.setFontSize(9);
  y += 16;
  doc.setFont("helvetica", "bold");
  const cols = [40, 190, 340, 385, 465, 520];
  ["Customer", "Product", "Qty", "Order value", "Charged", "Type"].forEach((h, i) => doc.text(h, cols[i], y));
  y += 6;
  doc.line(40, y, 555, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  for (const l of lines) {
    if (y > 800) {
      doc.addPage();
      y = 50;
    }
    doc.text(String(l.customer).slice(0, 30), cols[0], y);
    doc.text(String(l.product).slice(0, 28), cols[1], y);
    doc.text(String(l.qty), cols[2], y);
    doc.text(N(l.order_value), cols[3], y);
    doc.text(N(l.amount_charged), cols[4], y);
    doc.text(l.type, cols[5], y);
    y += 16;
  }

  doc.save(`meld-remittance-${merchantName.toLowerCase().replace(/\W+/g, "-")}-${date}.pdf`);
}
