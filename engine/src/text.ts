/**
 * 任意文本 → 字谱(CharSpec[]) 管线
 * 输入一段话(古诗/作文/文章片段), 提取汉字 → 查 12 册生字表属性(拼音/笔画) → 去重保序
 * 数据源: data/final/*.json(12 册生字表 + 语文园地, 2980 唯一字)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CharSpec } from './index.js';

const DATA_DIR = path.resolve(import.meta.dirname, '../../data/final');

interface CharInfo {
  pinyin?: string;
  strokes?: number;
  radical?: string;
  structure?: string;
}

let charMap: Map<string, CharInfo> | null = null;

function buildCharMap(): Map<string, CharInfo> {
  if (charMap) return charMap;
  charMap = new Map();
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!/^y.*\.json$/.test(f)) continue;
    const book = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
    for (const table of Object.values(book.tables ?? {}) as any[]) {
      for (const lesson of table.lessons ?? []) {
        for (const c of lesson.chars ?? []) {
          if (!charMap.has(c.char)) {
            charMap.set(c.char, {
              pinyin: c.pinyin, strokes: c.strokes,
              radical: c.radical, structure: c.structure,
            });
          }
        }
      }
      for (const g of table.gardens ?? []) {
        for (const c of g.chars ?? []) {
          if (!charMap.has(c.char)) charMap.set(c.char, { pinyin: c.pinyin, strokes: c.strokes });
        }
      }
    }
  }
  return charMap;
}

/** 练字选项/口语指令词(这些不是要练的字, 提取前剔除) */
const STRIP_PATTERN =
  /米字格|田字格|无格|方格|不要拼音|无拼音|不带拼音|带拼音|要拼音|不要笔画|不带笔画|不要笔画数|带笔画|带笔画数|练字帖|帮我|请生成|生成|打印|制作|一份|一个|字帖/g;

export interface TextCharsResult {
  chars: CharSpec[];
  /** 原文中各字出现次数(用于提示重复字) */
  repeats: Record<string, number>;
  /** 生字表未覆盖、无拼音/笔画的字 */
  uncovered: string[];
}

/** 提取文本中的汉字 → 去重(按首现顺序) → 附拼音/笔画 */
export function textToChars(text: string): TextCharsResult {
  const map = buildCharMap();
  const cleaned = text
    .replace(STRIP_PATTERN, ' ')
    .replace(/[^\u4e00-\u9fff]/g, '');

  const repeats: Record<string, number> = {};
  for (const ch of cleaned) repeats[ch] = (repeats[ch] ?? 0) + 1;

  const chars: CharSpec[] = [];
  const uncovered: string[] = [];
  const seen = new Set<string>();
  for (const ch of cleaned) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    const info = map.get(ch);
    if (info?.pinyin) {
      const spec: CharSpec = { char: ch, pinyin: info.pinyin };
      if (info.strokes !== undefined) spec.strokes = info.strokes;
      chars.push(spec);
    } else {
      uncovered.push(ch);
      chars.push({ char: ch });
    }
  }
  return { chars, repeats, uncovered };
}
