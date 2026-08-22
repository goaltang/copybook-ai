/**
 * 字帖引擎: 纯 TS, 输入结构化参数 → PDF
 * 可独立使用, 不依赖任何框架
 */
import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import subsetFont from 'subset-font';
import fs from 'node:fs';
import { type StrokeData, strokeBBox, glyphTransform, drawStrokePath, medianMid, dataToPage } from './strokes.js';

export interface CharSpec {
  char: string;
  pinyin?: string;      // 带声调拼音, 如 "Le"
  strokes?: number;     // 笔画数
  words?: string[];     // 组词(showWords 选项时由调用方填充)
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
  showWords?: boolean;            // 格下方显示组词(需 chars 带 words 字段)
  showStrokes?: boolean;          // 附加笔顺分解页(需传入 strokes 数据)
  strokes?: Map<string, StrokeData>;  // 笔顺数据(char → 笔画), 由调用方加载
  practiceCells?: number;         // 每个例字后的练习格数(空白供书写), 默认 5
  traceCells?: number;            // 练习格中前几个印浅灰字供描摹, 默认 0
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
    showPinyin = true, showStrokeCount = false, showWords = false,
    showStrokes = false, strokes, practiceCells = 5, traceCells = 0,
    fontPath, latinFontPath,
    pageSize = A4,
  } = params;
  const WORD_ROW_H = 13; // 组词行高(pt)

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // 收集各字体实际用到的字符, 用 harfbuzz(subset-font)预子集后再嵌入。
  // 注意: 不能用 @pdf-lib/fontkit 的 subset(对大型 CJK 字体子集会丢字形),
  // 预子集后以 subset:false 嵌入, 只解析不二次子集。
  const hanziSet = new Set<string>();
  const latinSet = new Set<string>();
  const addAll = (set: Set<string>, s?: string) => { if (s) for (const ch of s) set.add(ch); };
  addAll(hanziSet, title);
  addAll(hanziSet, '0123456789 笔顺分解');
  for (const c of chars) {
    addAll(hanziSet, c.char);
    addAll(hanziSet, c.words?.join(''));
    addAll(latinSet, c.pinyin);
  }
  addAll(latinSet, '0123456789 ');
  if (!latinFontPath) for (const ch of latinSet) hanziSet.add(ch);

  const fontBytes = fs.readFileSync(fontPath);
  const hanziSubset = await subsetFont(fontBytes, [...hanziSet].join(''), { targetFormat: 'sfnt' });
  const font = await doc.embedFont(hanziSubset, { subset: false });
  let latinFont: PDFFont = font;
  if (latinFontPath) {
    const latinSubset = await subsetFont(fs.readFileSync(latinFontPath), [...latinSet].join(''), { targetFormat: 'sfnt' });
    latinFont = await doc.embedFont(latinSubset, { subset: false });
  }

  const margin = 42;
  const usableW = pageSize.width - margin * 2;
  const usableH = pageSize.height - margin * 2;
  const gridW = Math.min(cellSize, usableW / cols);
  const pitch = showWords ? gridW + WORD_ROW_H : gridW;

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

  // 单元格序列: 每个字 = 1 个例字格 + practiceCells 个练习格(前 traceCells 个印浅灰字供描摹, 其余空白)
  type Cell = { kind: 'main' | 'trace' | 'blank'; spec: CharSpec };
  const cells: Cell[] = [];
  for (const c of chars) {
    cells.push({ kind: 'main', spec: c });
    for (let i = 0; i < practiceCells; i++) {
      cells.push({ kind: i < traceCells ? 'trace' : 'blank', spec: c });
    }
  }

  newPage();
  for (const cell of cells) {
    if (col >= cols) { col = 0; row++; }
    if (row >= rowsPerPage) { newPage(); }

    const c = cell.spec;
    const x = margin + col * gridW;
    const y = pageStartY - row * pitch;

    drawGrid(page!, x, y, gridW, grid);

    if (cell.kind === 'main') {
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

      // 组词: 格子下方, 灰色小字
      if (showWords && c.words && c.words.length > 0) {
        const words = c.words.slice(0, 3).join('  ');
        const wSize = gridW * 0.13;
        const wW = font.widthOfTextAtSize(words, wSize);
        page!.drawText(words, {
          x: x + (gridW - wW) / 2,
          y: y - WORD_ROW_H + 3,
          size: wSize, font, color: rgb(0.45, 0.45, 0.45),
        });
      }
    } else if (cell.kind === 'trace') {
      // 描摹格: 浅灰汉字, 供孩子描写
      const chSize = gridW * 0.62;
      const chW = font.widthOfTextAtSize(c.char, chSize);
      page!.drawText(c.char, {
        x: x + (gridW - chW) / 2,
        y: y + gridW * 0.15,
        size: chSize, font, color: rgb(0.78, 0.78, 0.78),
      });
    }
    // blank: 只画格子, 留白供书写

    col++;
  }

  // 笔顺分解页(累加式: 第 k 格显示 1..k 笔, 第 k 笔加深并标序号)
  if (showStrokes && strokes && strokes.size > 0) {
    const MAIN = 52;          // 主字格大小
    const GAP = 10;
    const ROW_H = MAIN + 18;  // 每行高度(含笔顺条)
    const rowsPerPage = Math.max(3, Math.floor((usableH - 40) / ROW_H));

    let sp: PDFPage | null = null;
    let sRow = 0, sCol = 0;
    const strokeChars = chars.filter((c) => strokes.has(c.char));

    function newStrokePage() {
      sp = doc.addPage([pageSize.width, pageSize.height]);
      sp.drawText('笔顺分解', {
        x: margin, y: pageSize.height - margin - 24, size: 15, font, color: rgb(0.1, 0.1, 0.1),
      });
      sRow = 0; sCol = 0;
    }

    newStrokePage();
    for (const c of strokeChars) {
      const sd = strokes.get(c.char)!;
      const n = sd.paths.length;
      if (n === 0) continue;

      if (sRow >= rowsPerPage) { newStrokePage(); }

      const topY = pageSize.height - margin - 40 - sRow * ROW_H;
      const mainX = margin;
      const mainY = topY - MAIN;

      // 主字格: 浅边框 + 汉字 + 拼音
      sp!.drawRectangle({ x: mainX, y: mainY, width: MAIN, height: MAIN, borderColor: rgb(0.72, 0.72, 0.72), borderWidth: 1 });
      const chSize = MAIN * 0.6;
      const chW = font.widthOfTextAtSize(c.char, chSize);
      sp!.drawText(c.char, { x: mainX + (MAIN - chW) / 2, y: mainY + MAIN * 0.15, size: chSize, font, color: rgb(0.1, 0.1, 0.1) });
      if (c.pinyin) {
        const pySize = 7;
        const pyW = latinFont.widthOfTextAtSize(c.pinyin, pySize);
        sp!.drawText(c.pinyin, { x: mainX + (MAIN - pyW) / 2, y: mainY + MAIN + 2, size: pySize, font: latinFont, color: rgb(0.4, 0.4, 0.4) });
      }

      // 笔顺分解条: 每格一笔(累加)
      const gs = Math.min(26, Math.max(13, (pageSize.width - margin - mainX - MAIN - GAP - margin) / n));
      const mids = medianMid(sd.medians);
      for (let k = 0; k < n; k++) {
        const gx = mainX + MAIN + GAP + k * (gs + 4);
        const gy = mainY + (MAIN - gs) / 2;
        sp!.drawRectangle({ x: gx, y: gy, width: gs, height: gs, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.6 });
        const bbox = strokeBBox(sd.paths);
        const t = glyphTransform(bbox, gx, gy, gs, 0.06);
        // 1..k 笔浅灰, 第 k 笔加深
        for (let j = 0; j <= k; j++) {
          const isLast = j === k;
          drawStrokePath(sp!, sd.paths[j]!, bbox, t, isLast ? rgb(0.15, 0.15, 0.15) : rgb(0.82, 0.82, 0.82), isLast ? 1.1 : 0.7);
        }
        // 序号: 放在第 k 笔 medians 中点
        const mid = mids[k];
        if (mid) {
          const num = String(k + 1);
          const numSize = Math.max(4, gs * 0.3);
          const mp = dataToPage(mid, t, bbox);
          const numW = latinFont.widthOfTextAtSize(num, numSize);
          sp!.drawText(num, { x: mp.x - numW / 2, y: mp.y - numSize / 2, size: numSize, font: latinFont, color: rgb(0.8, 0.1, 0.1) });
        }
      }
      sRow++;
    }
  }

  return doc.save();
}

