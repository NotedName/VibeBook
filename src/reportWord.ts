import { AlignmentType, BorderStyle, Document, Header, ImageRun, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlignTable, WidthType } from "docx";
import type { ReportModel } from "./reportDocs";

const FONT = "Times New Roman";
const SIZE = 24; // half-points: 12 pt
const DXA_PER_INCH = 1440;
/** Pictures are scaled to fit this box (in pixels at 96 per inch; the picture column is 3.25 inches wide). */
const PICTURE_MAX_W = 290;
const PICTURE_MAX_H = 330;

/** Builds the Word (.docx) file. */
export async function makeWord(model: ReportModel): Promise<Uint8Array> {
  const line = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const borders = { top: line, bottom: line, left: line, right: line };
  const margins = { top: 60, bottom: 60, left: 100, right: 100 };
  const text = (t: string, bold = false) => new TextRun({ text: t, bold, font: FONT, size: SIZE });
  const para = (t: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number } = {}) =>
    new Paragraph({ alignment: opts.align, spacing: { before: opts.before ?? 0, after: opts.after ?? 0 }, children: [text(t, opts.bold)] });

  const cell = (width: number, children: InstanceType<typeof Paragraph>[], valign: (typeof VerticalAlignTable)[keyof typeof VerticalAlignTable] = VerticalAlignTable.TOP) =>
    new TableCell({ width: { size: width, type: WidthType.DXA }, borders, margins, verticalAlign: valign, children });

  // Heading, in the order of the school's template: school lines, title, then the trainee's details.
  // The school lines sit in the page header, so they print on every page and take no room in the body.
  const pageHeader = new Header({ children: model.headerLines.map((l, i) => para(l, { bold: i === 0, align: AlignmentType.CENTER })) });
  const title = para(model.title, { bold: true, align: AlignmentType.CENTER, before: 0, after: 120 });
  const info = model.info.map((l) => para(l));

  // Table 1: dates, activities, skills (and hours when asked for). The header row repeats on every page.
  const t1w = model.table.widths.map((w) => Math.round(w * DXA_PER_INCH));
  const t1 = new Table({
    width: { size: t1w.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: t1w,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: model.table.headers.map((h, i) => cell(t1w[i], [para(h, { bold: true, align: AlignmentType.CENTER })])) }),
      ...model.table.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(t1w[i], [para(c, { align: AlignmentType.CENTER })], VerticalAlignTable.CENTER)) })),
      ...(model.table.footer ? [new TableRow({ cantSplit: true, children: model.table.footer.map((c, i) => cell(t1w[i], [para(c, { bold: true, align: AlignmentType.CENTER })], VerticalAlignTable.CENTER)) })] : []),
    ],
  });

  // Table 2: one row per week, pictures on the left and descriptions on the right. Rows may run over a page, as in the example.
  const half = Math.round(3.25 * DXA_PER_INCH);
  const picture = (img: { bytes: Uint8Array; width: number; height: number }) => {
    const scale = Math.min(1, PICTURE_MAX_W / img.width, PICTURE_MAX_H / img.height);
    return new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [new ImageRun({
        type: "jpg", data: img.bytes,
        transformation: { width: Math.max(1, Math.round(img.width * scale)), height: Math.max(1, Math.round(img.height * scale)) },
        altText: { name: "Photo", title: "Photo", description: "Photo from the log" },
      })],
    });
  };
  const t2 = new Table({
    width: { size: half * 2, type: WidthType.DXA },
    columnWidths: [half, half],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: [
        cell(half, [para("Picture/s", { bold: true, align: AlignmentType.CENTER })]),
        cell(half, [para("Description of the Activities", { bold: true, align: AlignmentType.CENTER })]),
      ] }),
      ...model.groups.map((g) => new TableRow({ children: [
        cell(half, [para(g.label), ...g.images.map(picture)]),
        cell(half, g.paragraphs.length ? g.paragraphs.map((p) => para(p, { after: 120 })) : [para("")]),
      ] })),
    ],
  });

  const doc = new Document({
    creator: "VibeBook",
    title: model.title,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 540 } } },
      headers: { default: pageHeader },
      children: [title, ...info, para("", { after: 120 }), t1, para("", { after: 240 }), para(model.picturesTitle), t2],
    }],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
