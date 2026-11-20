import { AlignmentType, BorderStyle, Document, Footer, Header, HeightRule, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlignTable, WidthType, type IBorderOptions } from "docx";
import type { Block, Cell, FormDoc, Run, SigSide } from "./formDocs";

const FONT = "Times New Roman";
const DXA = 1440;
const SPACING = { before: 0, after: 0, line: 259 }; // like the school's documents: no space between paragraphs, 1.08 lines

/** Builds the Word (.docx) of an OJT form. Word is the right choice when someone else has to edit or sign it. */
export async function makeFormWord(model: FormDoc): Promise<Uint8Array> {
  const sz = model.size * 2;
  const line: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const none: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: none, bottom: none, left: none, right: none };
  const run = (r: Run, size = sz) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, font: FONT, size });
  const al = (a?: "left" | "center" | "justify") => (a === "center" ? AlignmentType.CENTER : a === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT);
  const para = (runs: Run[], a?: "left" | "center" | "justify", size = sz, extra: Record<string, unknown> = {}) =>
    new Paragraph({ alignment: al(a), spacing: SPACING, children: runs.length ? runs.map((r) => run(r, size)) : [run({ text: "" }, size)], ...extra });

  const out: (Paragraph | Table)[] = [];

  const cellOf = (c: Cell, w: number, defAlign: "left" | "center", tight: boolean) => {
    const o = typeof c === "string" ? { text: c } : c;
    const size = (o.size ?? model.size) * 2;
    const a = o.align ?? defAlign;
    const children: Paragraph[] = [];
    if (o.head) children.push(para([{ text: o.head, bold: true }], "left", size));
    const lines = o.text === "" ? [""] : o.text.split("\n");
    lines.forEach((l) => children.push(para([{ text: l, bold: o.bold }], a, size)));
    return new TableCell({
      width: { size: w, type: WidthType.DXA }, columnSpan: o.span, verticalAlign: o.valign === "top" ? VerticalAlignTable.TOP : VerticalAlignTable.CENTER,
      borders: { top: line, bottom: line, left: line, right: line },
      shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
      margins: { top: tight ? 20 : 60, bottom: tight ? 20 : 60, left: 100, right: 100 },
      children,
    });
  };

  const sigSide = (s: SigSide | undefined, w: number) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: noBorders, margins: { top: 0, bottom: 0, left: 60, right: 60 },
    children: !s ? [para([])] : [
      para(s.label ? [{ text: s.label }] : []), para([]),
      para([{ text: s.name || " ", bold: true }], "center"),
      para([{ text: s.caption }], "center", sz, { border: { top: line } }),
    ],
  });

  const render = (b: Block) => {
    if (b.t === "p") out.push(para(b.runs, b.align));
    else if (b.t === "lines") {
      for (let i = 0; i < b.count; i++) out.push(para([], "left", sz, { spacing: { ...SPACING, before: 200 }, border: { bottom: line } }));
    } else if (b.t === "sig") {
      const w = Math.round(3.1 * DXA);
      out.push(new Table({
        width: { size: w * 2, type: WidthType.DXA }, columnWidths: [w, w], layout: TableLayoutType.FIXED,
        borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
        rows: [new TableRow({ children: [sigSide(b.left, w), sigSide(b.right, w)] })],
      }));
    } else if (b.t === "cols") {
      const ws = b.widths.map((x) => Math.round(x * DXA));
      out.push(new Table({
        width: { size: ws.reduce((a, c) => a + c, 0), type: WidthType.DXA }, columnWidths: ws, layout: TableLayoutType.FIXED,
        borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
        rows: [new TableRow({ children: b.cells.map((paras, i) => new TableCell({ width: { size: ws[i], type: WidthType.DXA }, borders: noBorders, margins: { top: 0, bottom: 0, left: 0, right: 60 }, children: paras.map((runs) => para(runs)) })) })],
      }));
    } else {
      const ws = b.widths.map((x) => Math.round(x * DXA));
      out.push(new Table({
        width: { size: ws.reduce((a, c) => a + c, 0), type: WidthType.DXA }, columnWidths: ws, layout: TableLayoutType.FIXED,
        alignment: b.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        rows: b.rows.map((r, ri) => {
          let col = 0;
          const h = b.rowHeights?.[ri];
          return new TableRow({
            cantSplit: true, tableHeader: ri < (b.headerRows ?? 0),
            height: h ? { value: Math.round(h * DXA), rule: HeightRule.ATLEAST } : undefined,
            children: r.map((c) => {
              const span = typeof c === "string" ? 1 : c.span ?? 1;
              const w = ws.slice(col, col + span).reduce((a, x) => a + x, 0);
              const cell = cellOf(c, w, b.align?.[col] ?? "center", !!b.tight);
              col += span;
              return cell;
            }),
          });
        }),
      }));
    }
  };
  model.blocks.forEach(render);
  out.push(para([]));

  // "Include header and footer": the school lines repeat at the top of every page, and the footer carries the name and the page number.
  const header = model.head.length ? new Header({ children: model.head.map((h) => para([{ text: h.text, bold: h.bold }], "center")) }) : undefined;
  const footer = model.footer ? new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER, spacing: SPACING,
      children: [
        new TextRun({ text: `${model.footer}  ·  Page `, font: FONT, size: 18 }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 }),
        new TextRun({ text: " of ", font: FONT, size: 18 }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18 }),
      ],
    })],
  }) : undefined;

  const m = model.margins;
  const doc = new Document({
    creator: "VibeBook", title: model.title,
    styles: { default: { document: { run: { font: FONT, size: sz } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: Math.round(m.top * DXA), bottom: Math.round(m.bottom * DXA), left: Math.round(m.left * DXA), right: Math.round(m.right * DXA), header: 432, footer: 432 } } },
      headers: header ? { default: header } : undefined, footers: footer ? { default: footer } : undefined,
      children: out,
    }],
  });
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}
