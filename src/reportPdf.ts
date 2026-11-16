import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { ReportModel } from "./reportDocs";

const PAGE_W = 612, PAGE_H = 792, MARGIN = 72;
const BODY_W = PAGE_W - 2 * MARGIN;
const SIZE = 12;
const LEADING = 13.8;
const PAD_X = 5, PAD_Y = 4;
const PARAGRAPH_GAP = 6;
const PICTURE_MAX_H = 250;
const PICTURE_GAP = 4;

type Item = { kind: "line"; text: string } | { kind: "image"; img: PDFImage; w: number; h: number };
type TextLine = { text: string; gap: number };

/** Builds the PDF. */
export async function makePdf(model: ReportModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(model.title);
  doc.setCreator("VibeBook");
  doc.setProducer("VibeBook");
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const black = rgb(0, 0, 0);
  const supported = new Set(regular.getCharacterSet());

  // The standard PDF fonts hold Western letters only. Anything else (emoji, say) is left out instead of failing the export.
  const clean = (t: string) => {
    let out = "";
    for (const ch of t.replace(/\t/g, " ")) {
      const cp = ch.codePointAt(0)!;
      if (cp === 0xa0) out += " ";
      else if (supported.has(cp) || ch === " ") out += ch;
    }
    return out;
  };

  const width = (t: string, f: PDFFont) => f.widthOfTextAtSize(t, SIZE);

  function wrap(text: string, f: PDFFont, maxW: number): string[] {
    const words = clean(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (let w of words) {
      while (width(w, f) > maxW && w.length > 1) { // a word wider than the column is cut
        let cut = w.length;
        while (cut > 1 && width(w.slice(0, cut), f) > maxW) cut--;
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const test = cur ? `${cur} ${w}` : w;
      if (width(test, f) <= maxW) cur = test;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  let page!: PDFPage;
  let top = MARGIN; // distance from the top edge of the page
  const bottom = PAGE_H - MARGIN;
  // School, department, course and school year are printed small at the top of every page, above the margin line.
  const HEAD_SIZE = 10, HEAD_LEADING = 11.5;
  const headLines = model.headerLines.flatMap((l, i) => wrap(l, i === 0 ? bold : regular, BODY_W).map((t) => ({ t, f: i === 0 ? bold : regular })));
  const drawHeader = () => {
    let y = 24;
    for (const { t, f } of headLines) {
      page.drawText(t, { x: PAGE_W / 2 - f.widthOfTextAtSize(t, HEAD_SIZE) / 2, y: PAGE_H - y - 8, size: HEAD_SIZE, font: f, color: black });
      y += HEAD_LEADING;
    }
  };
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); top = MARGIN; drawHeader(); };

  const text = (t: string, x: number, atTop: number, f: PDFFont) =>
    page.drawText(t, { x, y: PAGE_H - atTop - 10.3, size: SIZE, font: f, color: black });
  const centered = (t: string, cx: number, atTop: number, f: PDFFont) => text(t, cx - width(t, f) / 2, atTop, f);
  const box = (x: number, atTop: number, w: number, h: number) =>
    page.drawRectangle({ x, y: PAGE_H - atTop - h, width: w, height: h, borderColor: black, borderWidth: 0.75 });

  newPage();

  // Heading (the school lines are in the page header)
  centered(model.title, PAGE_W / 2, top, bold);
  top += LEADING + 8;
  model.info.forEach((l) => wrap(l, regular, BODY_W).forEach((ln) => { text(ln, MARGIN, top, regular); top += LEADING; }));
  top += 12;

  // Table 1: dates, activities, skills. The header row is repeated at the top of each page.
  const colW = model.table.widths.map((w) => w * 72);
  const colX = colW.map((_, i) => MARGIN + colW.slice(0, i).reduce((a, b) => a + b, 0));
  function row1(cells: string[], f: PDFFont, isHeader: boolean) {
    const lines = cells.map((c, i) => wrap(c, f, colW[i] - 2 * PAD_X));
    const h = Math.max(...lines.map((l) => l.length)) * LEADING + 2 * PAD_Y;
    if (top + h > bottom) {
      newPage();
      if (!isHeader) row1(model.table.headers, bold, true);
    }
    cells.forEach((_, i) => {
      box(colX[i], top, colW[i], h);
      const startTop = top + (h - lines[i].length * LEADING) / 2;
      lines[i].forEach((ln, j) => centered(ln, colX[i] + colW[i] / 2, startTop + j * LEADING, f));
    });
    top += h;
  }
  row1(model.table.headers, bold, true);
  model.table.rows.forEach((r) => row1(r, regular, false));
  if (model.table.footer) row1(model.table.footer, bold, false);

  // Table 2: pictures on the left, descriptions on the right, one row per week. A row that does not fit
  // carries on at the top of the next page under a repeated header, as in the example.
  top += 22;
  if (top + 2 * LEADING + 2 * PAD_Y + 60 > bottom) newPage();
  text(model.picturesTitle, MARGIN, top, regular);
  top += LEADING + 2;

  const halfW = BODY_W / 2;
  const inner = halfW - 2 * PAD_X;
  const header2 = () => {
    const h = LEADING + 2 * PAD_Y;
    box(MARGIN, top, halfW, h);
    box(MARGIN + halfW, top, halfW, h);
    centered("Picture/s", MARGIN + halfW / 2, top + PAD_Y, bold);
    centered("Description of the Activities", MARGIN + halfW * 1.5, top + PAD_Y, bold);
    top += h;
  };
  header2();

  for (const g of model.groups) {
    const left: Item[] = [{ kind: "line", text: g.label }];
    for (const im of g.images) {
      try {
        const img = await doc.embedJpg(im.bytes);
        const scale = Math.min(inner / im.width, PICTURE_MAX_H / im.height);
        left.push({ kind: "image", img, w: im.width * scale, h: im.height * scale });
      } catch { /* a picture that cannot be read is skipped */ }
    }
    const right: TextLine[] = g.paragraphs.flatMap((p) => {
      const lines = wrap(p, regular, inner);
      return lines.map((t, i) => ({ text: t, gap: i === lines.length - 1 ? PARAGRAPH_GAP : 0 }));
    });

    let stuck = 0;
    while (left.length || right.length || stuck === 0) {
      if (bottom - top < 2 * LEADING + 2 * PAD_Y + 10) { newPage(); header2(); }
      const avail = bottom - top - 2 * PAD_Y;
      let ly = 0, ry = 0;
      const startTop = top + PAD_Y;

      while (left.length) {
        const it = left[0];
        const h = it.kind === "line" ? LEADING : it.h + PICTURE_GAP;
        if (ly + h > avail) break;
        if (it.kind === "line") text(it.text, MARGIN + PAD_X, startTop + ly, regular);
        else page.drawImage(it.img, { x: MARGIN + PAD_X, y: PAGE_H - (startTop + ly + PICTURE_GAP) - it.h, width: it.w, height: it.h });
        ly += h;
        left.shift();
      }
      while (right.length && ry + LEADING <= avail) {
        const ln = right.shift()!;
        text(ln.text, MARGIN + halfW + PAD_X, startTop + ry, regular);
        ry += LEADING + ln.gap;
      }

      const h = Math.max(ly, ry) + 2 * PAD_Y;
      box(MARGIN, top, halfW, h);
      box(MARGIN + halfW, top, halfW, h);
      top += h;
      stuck = ly === 0 && ry === 0 ? stuck + 1 : 1;
      if (left.length || right.length) {
        if (stuck > 2) break; // nothing fits even on an empty page: give up on the rest of this row
        newPage();
        header2();
      } else break;
    }
  }

  return await doc.save();
}
