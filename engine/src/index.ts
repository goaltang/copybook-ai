/**
 * 字帖引擎: 纯 TS, 输入结构化参数 → PDF
 * 可独立使用, 不依赖任何框架
 */
import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';

export interface CharSpec {
  char: string;
  pinyin?: string;      // 带声调拼音, 如 "Le"
  strokes?: number;     // 笔画数
}

export type GridType = 'tian' | 'mi' | 'plain'; // 田字格 / 米字格 / 无格

export interface CopybookParams {
  title?: string;                 // 字帖标题, 如 "第1课 秋天 · 会写字"
  chars: CharSpec[];
  grid?: GridType;
  cellSize?: number;              // 单元格边长(pt), 默认 72(2.54cm)
  cols?: number;                  // 每行格数, 默认 6
  rowsPerPage?: number;           // 每页行数, 默认 8
  showPinyin?: boolean;           // 格内显示拼音(格子上方)
  showStrokeCount?: boolean;      // 格子角落显示笔画数
  fontPath: string;               // 楷体 TTF 路径(汉字用)
  latinFontPath?: string;         // 拼音用字体(需含带声调拉丁字符), 默认同 fontPath
  pageSize?: { width: number; height: number }; // 默认 A4
}

const A4 = { width: 595.28, height: 841.89 };

function drawGrid(page: PDFPage, x: number, y: number, size: number, grid: GridType, color = rgb(0.72, 0.72, 0.72)) {
  page.drawRectangle({ x, y, width: size, height: size, borderColor: rgb(0, 0, 0), borderWidth: 1.1 });
  const mid = size / 2;
  if (grid === 'tian') {
    page.drawLine({ start: { x, y: y + mid }, end: { x: x + size, y: y + mid }, color, thickness: 0.45 });
    page.drawLine({ start: { x: x + mid, y }, end: { x: x + mid, y: y + size }, color, thickness: 0.45 });
  } else if (grid === 'mi') {
    page.drawLine({ start: { x, y: y + mid }, end: { x: x + size, y: y + mid }, color, thickness: 0.45 });
    page.drawLine({ start: { x: x + mid, y }, end: { x: x + mid, y: y + size }, color, thickness: 0.45 });
    page.drawLine({ start: { x, y }, end: { x: x + size, y: y + size }, color, thickness: 0.3 });
    page.drawLine({ start: { x, y: y + size }, end: { x: x + size, y }, color, thickness: 0.3 });
  }
}

export async function generateCopybook(params: CopybookParams): Promise<Uint8Array> {
  const {
    title, chars, grid = 'tian', cellSize = 72, cols = 6, rowsPerPage = 8,
    showPinyin = true, showStrokeCount = false, fontPath, latinFontPath,
    pageSize = A4,
  } = params;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = fs.readFileSync(fontPath);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const latinFont = latinFontPath
    ? await doc.embedFont(fs.readFileSync(latinFontPath), { subset: true })
    : font;

  const margin = 42;
  const usableW = pageSize.width - margin * 2;
  const usableH = pageSize.height - margin * 2;
  const gridW = Math.min(cellSize, usableW / cols);

  let page: PDFPage | null = null;
  let col = 0, row = 0, pageStartY = 0;

  function newPage() {
    page = doc.addPage([pageSize.width, pageSize.height]);
    pageStartY = pageSize.height - margin - gridW;
    if (title) {
      page.drawText(title, {
        x: margin, y: pageStartY + gridW - 14, size: 15, font, color: rgb(0.1, 0.1, 0.1),
      });
      pageStartY -= 8;
    }
    col = 0; row = 0;
  }

  newPage();
  for (const c of chars) {
    if (col >= cols) { col = 0; row++; }
    if (row >= rowsPerPage) { newPage(); }

    const x = margin + col * gridW;
    const y = pageStartY - row * gridW;

    drawGrid(page!, x, y, gridW, grid);

    // 拼音: 格子顶部
    if (showPinyin && c.pinyin) {
      const py = c.pinyin;
      const pySize = gridW * 0.16;
      const pyW = latinFont.widthOfTextAtSize(py, pySize);
      page!.drawText(py, { x: x + (gridW - pyW) / 2, y: y + gridW - pySize - 3, size: pySize, font: latinFont, color: rgb(0, 0, 0) });
    }
    // 笔画数: 左下角
    if (showStrokeCount && c.strokes) {
      const s = String(c.strokes);
      const sSize = gridW * 0.12;
      page!.drawText(s, { x: x + 3, y: y + 2, size: sSize, font, color: rgb(0.55, 0.55, 0.55) });
    }
    // 汉字居中
    const chSize = gridW * 0.62;
    const chW = font.widthOfTextAtSize(c.char, chSize);
    page!.drawText(c.char, {
      x: x + (gridW - chW) / 2,
      y: y + gridW * 0.15,
      size: chSize, font, color: rgb(0, 0, 0),
    });

    col++;
  }

  return doc.save();
}

/** 从数据包 JSON 组装字帖参数 */
export function lessonChars(book: any, table: 'shizi' | 'xiezi', lessonNo: number): CharSpec[] {
  const t = book.tables?.[table];
  if (!t) return [];
  const lessons = t.lessons.filter((l: any) => l.no === lessonNo);
  const chars = lessons.flatMap((l: any) => l.chars);
  return chars.map((c: any) => ({ char: c.char, pinyin: c.pinyin, strokes: c.strokes }));
}
