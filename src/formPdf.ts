import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Cell, FormDoc, Run } from "./formDocs";

const PAGE_W = 612, PAGE_H = 792;

/** Builds the PDF of an OJT form: a print-ready copy of the same layout as the Word file. */
export async function makeFormPdf(model: FormDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(model.title); doc.setCreator("VibeBook"); doc.setProducer("VibeBook");
  const fonts = {
    r: await doc.embedFont(StandardFonts.TimesRoman), b: await doc.embedFont(StandardFonts.TimesRomanBold),
    i: await doc.embedFont(StandardFonts.TimesRomanItalic), bi: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
  };
  const black = rgb(0, 0, 0);
  const supported = new Set(fonts.r.getCharacterSet());
  const clean = (t: string) => { let o = ""; for (const ch of t) { const cp = ch.codePointAt(0)!; if (cp === 0xa0) o += " "; else if (supported.has(cp) || ch === " ") o += ch; } return o; };
  const SIZE = model.size, LEAD = SIZE * 1.16;
  const L = model.margins.left * 72, R = PAGE_W - model.margins.right * 72, BODY_W = R - L;
  const fontOf = (r: Run) => (r.bold && r.italic ? fonts.bi : r.bold ? fonts.b : r.italic ? fonts.i : fonts.r);
  const width = (t: string, f: PDFFont, s = SIZE) => f.widthOfTextAtSize(t, s);

  // The school lines sit in the top margin of every page (when included); the body starts below them.
  const HEAD_SIZE = 10.5, HEAD_LEAD = HEAD_SIZE * 1.18, HEAD_TOP = 31;
  const headH = model.head.length ? model.head.length * HEAD_LEAD + 8 : 0;
  const top0 = Math.max(model.margins.top * 72, HEAD_TOP + headH + 10);
  const bottom = PAGE_H - Math.max(model.margins.bottom * 72, model.footer ? 54 : 0);

  type Tok = { text: string; font: PDFFont };
  function wrap(runs: Run[], maxW: number, size = SIZE): Tok[][] {
    const toks: Tok[] = [];
    for (const r of runs) for (const w of clean(r.text).split(/(\s+)/)) if (w !== "") toks.push({ text: w, font: fontOf(r) });
    const lines: Tok[][] = []; let cur: Tok[] = []; let curW = 0;
    const trim = () => { while (cur.length && /^\s+$/.test(cur[cur.length - 1].text)) cur.pop(); };
    for (const t of toks) {
      const tw = width(t.text, t.font, size);
      if (/^\s+$/.test(t.text)) { if (cur.length) { cur.push(t); curW += tw; } continue; }
      if (curW + tw > maxW && cur.length) { trim(); lines.push(cur); cur = []; curW = 0; }
      cur.push(t); curW += tw;
    }
    trim(); lines.push(cur);
    return lines;
  }
  const lineW = (l: Tok[], size = SIZE) => l.reduce((a, t) => a + width(t.text, t.font, size), 0);

  let page!: PDFPage; let top = top0;
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); top = top0; };
  /** Draws one line. Neighbouring pieces in the same font are drawn as one string, so spaces are never lost between words. */
  const drawLine = (l: Tok[], x: number, at: number, size = SIZE) => {
    const groups: Tok[] = [];
    for (const t of l) { const last = groups[groups.length - 1]; if (last && last.font === t.font) last.text += t.text; else groups.push({ ...t }); }
    let cx = x;
    for (const g of groups) { page.drawText(g.text, { x: cx, y: PAGE_H - at - size * 0.86, size, font: g.font, color: black }); cx += width(g.text, g.font, size); }
  };
  const rule = (x1: number, x2: number, at: number) => page.drawLine({ start: { x: x1, y: PAGE_H - at }, end: { x: x2, y: PAGE_H - at }, thickness: 0.75, color: black });
  const room = (h: number) => { if (top + h > bottom) newPage(); };
  const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);

  function paragraph(runs: Run[], align: "left" | "center" | "justify" = "left", x = L, w = BODY_W) {
    const lines = wrap(runs, w);
    lines.forEach((l, i) => {
      room(LEAD);
      const lw = lineW(l);
      if (align === "justify" && i < lines.length - 1 && l.length > 2) {
        const gaps = l.filter((t) => /^\s+$/.test(t.text)); const extra = (w - lw) / Math.max(1, gaps.length);
        let cx = x; for (const t of l) { page.drawText(t.text, { x: cx, y: PAGE_H - top - SIZE * 0.86, size: SIZE, font: t.font, color: black }); cx += width(t.text, t.font) + (/^\s+$/.test(t.text) ? extra : 0); }
      } else drawLine(l, align === "center" ? x + (w - lw) / 2 : x, top);
      top += LEAD;
    });
  }

  newPage();

  for (const b of model.blocks) {
    if (b.t === "p") paragraph(b.runs, b.align);
    else if (b.t === "lines") { for (let i = 0; i < b.count; i++) { room(LEAD * 2); top += LEAD * 1.6; rule(L, R, top); } top += 2; }
    else if (b.t === "cols") {
      const cw = b.widths.map((x) => x * 72);
      const wrapped = b.cells.map((paras, i) => paras.flatMap((runs) => wrap(runs, cw[i] - 6)));
      const n = Math.max(...wrapped.map((l) => l.length)); room(n * LEAD);
      wrapped.forEach((ls, i) => ls.forEach((l, j) => drawLine(l, L + cw.slice(0, i).reduce((a, v) => a + v, 0), top + j * LEAD)));
      top += n * LEAD;
    } else if (b.t === "sig") {
      room(LEAD * 5);
      const w = 3.1 * 72 - 12; const sides = [b.left, b.right];
      sides.forEach((s, i) => {
        if (!s) return; const x = L + i * 3.1 * 72 + 6;
        if (s.label) drawLine([{ text: clean(s.label), font: fonts.r }], x, top);
        const n = clean(s.name); if (n) drawLine([{ text: n, font: fonts.b }], x + w / 2 - width(n, fonts.b) / 2, top + LEAD * 2);
        rule(x, x + w, top + LEAD * 3);
        const c = clean(s.caption); drawLine([{ text: c, font: fonts.r }], x + w / 2 - width(c, fonts.r) / 2, top + LEAD * 3);
      });
      top += LEAD * 4;
    } else {
      const cw = b.widths.map((x) => x * 72); const tw = cw.reduce((a, v) => a + v, 0);
      const x0 = b.center ? L + (BODY_W - tw) / 2 : L; const padY = b.tight ? 1.5 : 4, padX = 5;
      const drawRow = (cells: Cell[], ri: number, isHeader: boolean) => {
        let col = 0;
        const laid = cells.map((c) => {
          const o = typeof c === "string" ? { text: c } as Exclude<Cell, string> : c; const span = o.span ?? 1;
          const w = cw.slice(col, col + span).reduce((a, v) => a + v, 0); const x = x0 + cw.slice(0, col).reduce((a, v) => a + v, 0);
          const size = o.size ?? SIZE; const align = o.align ?? b.align?.[col] ?? "center"; col += span;
          const lines: Tok[][] = [];
          if (o.head) lines.push(...wrap([{ text: o.head, bold: true }], w - 2 * padX, size));
          for (const part of (o.text === "" ? [""] : o.text.split("\n"))) lines.push(...wrap([{ text: part, bold: o.bold }], w - 2 * padX, size));
          return { x, w, size, align, lines, fill: o.fill, valign: o.valign ?? "center" };
        });
        const minH = (b.rowHeights?.[ri] ?? 0) * 72;
        const h = Math.max(minH, Math.max(...laid.map((l) => l.lines.length * l.size * 1.16)) + 2 * padY);
        if (top + h > bottom) { newPage(); if (!isHeader && (b.headerRows ?? 0) > 0) drawRow(b.rows[0], 0, true); }
        laid.forEach((l) => {
          page.drawRectangle({ x: l.x, y: PAGE_H - top - h, width: l.w, height: h, borderColor: black, borderWidth: 0.75, color: l.fill ? hex(l.fill) : undefined });
          const start = l.valign === "top" ? top + padY + 1 : top + (h - l.lines.length * l.size * 1.16) / 2;
          l.lines.forEach((ln, j) => { const lw = lineW(ln, l.size); drawLine(ln, l.align === "center" ? l.x + (l.w - lw) / 2 : l.x + padX, start + j * l.size * 1.16, l.size); });
        });
        top += h;
      };
      b.rows.forEach((r, ri) => drawRow(r, ri, ri < (b.headerRows ?? 0)));
    }
  }

  // Header on every page, footer with the page number.
  const pages = doc.getPages();
  pages.forEach((pg, n) => {
    model.head.forEach((h, i) => {
      const f = h.bold ? fonts.b : fonts.r; const t = clean(h.text);
      pg.drawText(t, { x: PAGE_W / 2 - width(t, f, HEAD_SIZE) / 2, y: PAGE_H - HEAD_TOP - i * HEAD_LEAD - HEAD_SIZE, size: HEAD_SIZE, font: f, color: black });
    });
    if (model.footer) {
      const t = clean(`${model.footer}  ·  Page ${n + 1} of ${pages.length}`);
      pg.drawText(t, { x: PAGE_W / 2 - width(t, fonts.r, 9) / 2, y: 30, size: 9, font: fonts.r, color: black });
    }
  });
  return await doc.save();
}
