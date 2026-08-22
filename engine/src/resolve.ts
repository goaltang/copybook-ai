/**
 * 共享解析层: ParseResult → 字谱(CharSpec[]) + 描述/错误
 * cli.ts 与 server.ts 共用, 避免重复的找课逻辑
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateCopybook, type CharSpec, type CopybookParams } from './index.js';
import type { ParseResult } from './parse.js';
import { textToChars, unlearnedChars, attachWords } from './text.js';
import { loadStrokeMap } from './strokes.js';

const DATA_DIR = path.resolve(import.meta.dirname, '../../data/final');
const FONT_PATH = path.resolve(import.meta.dirname, '../fonts/LXGWWenKai-Regular.ttf');
const LATIN_FONT_PATH = path.resolve(import.meta.dirname, '../fonts/DejaVuSans.ttf');

const bookCache = new Map<string, any>();

export function loadBook(book: string): any | null {
  const cached = bookCache.get(book);
  if (cached) return cached;
  const dataFile = path.join(DATA_DIR, `${book}.json`);
  if (!fs.existsSync(dataFile)) return null;
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  bookCache.set(book, data);
  return data;
}

/** 单字拼音规范为小写(数据源自教材正文句首提取, 存在大写首字母, 统一转小写) */
function normPinyin(py?: string): string | undefined {
  return py ? py.toLowerCase() : undefined;
}

export interface ResolveResult {
  chars: CharSpec[];
  desc: string;
  error?: string;
  /** text/unlearned 模式的附加信息(用于提示) */
  repeats?: Record<string, number>;
  uncovered?: string[];
  learnedCount?: number;
}

export function resolveChars(parsed: ParseResult): ResolveResult {
  // ---- 任意文本 / 未学字模式 ----
  if (parsed.mode === 'text' || parsed.mode === 'unlearned') {
    let chars;
    let repeats;
    let uncovered;
    let learnedCount = 0;
    if (parsed.mode === 'unlearned' && parsed.learnedBook) {
      const r = unlearnedChars(parsed.text ?? '', parsed.learnedBook);
      chars = r.chars; repeats = r.repeats; uncovered = r.uncovered; learnedCount = r.learnedCount;
    } else {
      const r = textToChars(parsed.text ?? '');
      chars = r.chars; repeats = r.repeats; uncovered = r.uncovered;
    }
    const repeatDesc = Object.entries(repeats)
      .filter(([, n]) => (n as number) > 1)
      .map(([c, n]) => `${c}×${n}`)
      .join(' ');
    if (chars.length === 0) {
      const error =
        parsed.mode === 'unlearned' && parsed.learnedBook
          ? `文中汉字均已学至《${parsed.learnedBook.replace(/^y/, '')}》(已学 ${learnedCount} 字)。若想找某一课, 请说课号, 如"一年级上册第5课"`
          : '没有提取到要练的汉字';
      return { chars, desc: '', error, repeats, uncovered, learnedCount };
    }
    const desc =
      parsed.mode === 'unlearned'
        ? `未学字 ${chars.length} 字 (已学集合 ${learnedCount} 字)${repeatDesc ? ` (重复: ${repeatDesc})` : ''}`
        : `文本练字 ${chars.length} 字${repeatDesc ? ` (重复: ${repeatDesc})` : ''}`;
    return { chars, desc, repeats, uncovered, learnedCount };
  }

  // ---- 教材课号模式 ----
  if (!parsed.book) return { chars: [], desc: '', error: '无法确定册别' };
  const bookData = loadBook(parsed.book);
  if (!bookData) return { chars: [], desc: '', error: `数据文件不存在: ${parsed.book}` };
  const tableName = parsed.table === 'xiezi' ? '写字表' : '识字表';
  const table = bookData.tables?.[parsed.table];
  if (!table) return { chars: [], desc: '', error: `该册没有${tableName}` };

  const toChars = (lessons: any[]): CharSpec[] =>
    lessons.flatMap((l: any) =>
      l.chars.map((c: any) => {
        const spec: CharSpec = { char: c.char };
        const py = normPinyin(c.pinyin);
        if (py !== undefined) spec.pinyin = py;
        if (typeof c.strokes === 'number') spec.strokes = c.strokes;
        return spec;
      })
    );

  let matched: any[];
  if (parsed.lessonFilter === 'ALL') {
    matched = table.lessons;
  } else {
    const filter = parsed.lessonFilter;
    if (filter.no !== undefined) {
      const byNo = table.lessons.filter((l: any) => l.no === filter.no);
      if (byNo.length === 0) {
        return { chars: [], desc: '', error: `该册数据中未找到第${filter.no}课` };
      }
      if (filter.type) {
        matched = byNo.filter((l: any) => l.type === filter.type);
        if (matched.length === 0) matched = byNo;
      } else if (byNo.length > 1) {
        const withType = byNo.filter((l: any) => l.type !== null);
        if (withType.length > 0) {
          const keWen = withType.find((l: any) => l.type === '课文');
          matched = keWen ? [keWen] : [withType[0]!];
        } else {
          matched = [byNo[0]!];
        }
      } else {
        matched = byNo;
      }
    } else if (filter.title) {
      return { chars: [], desc: '', error: `标题匹配"${filter.title}"暂不支持, 请使用课号, 如"第5课"` };
    } else if (filter.type) {
      matched = table.lessons.filter((l: any) => l.type === filter.type);
    } else {
      matched = [];
    }
  }

  const chars = toChars(matched);
  if (chars.length === 0) return { chars, desc: '', error: '没有找到要生成的字' };
  const lessonNos = matched.map((l: any) => l.no);
  const lessonTypes = matched.map((l: any) => l.type || '默认');
  const desc =
    parsed.lessonFilter === 'ALL'
      ? `全册 ${matched.length} 课, ${chars.length} 字`
      : `第${lessonNos.join(',')}课 (${lessonTypes.join(',')}), ${chars.length} 字`;
  return { chars, desc };
}

/** 按解析结果生成 PDF(统一组装引擎参数: 练习格/描红/组词/笔顺等) */
export async function buildPdf(parsed: ParseResult, chars: CharSpec[]): Promise<Uint8Array> {
  const params: CopybookParams = {
    title: parsed.title,
    chars: parsed.showWords ? attachWords(chars) : chars,
    grid: parsed.grid,
    showPinyin: parsed.showPinyin,
    showStrokeCount: parsed.showStrokeCount,
    showWords: parsed.showWords === true,
    practiceCells: parsed.practiceCells ?? 5,
    traceCells: parsed.traceCells ?? 0,
    fontPath: FONT_PATH,
    latinFontPath: LATIN_FONT_PATH,
  };
  if (parsed.showStrokes === true) {
    params.showStrokes = true;
    params.strokes = loadStrokeMap();
  }
  return generateCopybook(params);
}
