/**
 * 任意文本 → 字谱(CharSpec[]) 管线
 * 输入一段话(古诗/作文/文章片段), 提取汉字 → 拼音/笔画 → 去重保序
 * 拼音: pinyin-pro 按上下文定音(多音字, 如"春眠不觉晓"的"觉"→ jué);
 *       pinyin-pro 不认识的字回退 12 册生字表; 两者都无 → uncovered
 * 笔画: 12 册生字表(data/final/*.json, 2980 唯一字)
 */
import fs from 'node:fs';
import path from 'node:path';
import { pinyin } from 'pinyin-pro';
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

/** 组词数据缓存: char → 词列表(词频降序) */
let wordsCache: Record<string, string[]> | null = null;

function loadWords(): Record<string, string[]> {
  if (wordsCache) return wordsCache;
  const file = path.join(DATA_DIR, 'words.json');
  const out: Record<string, string[]> = {};
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const [ch, list] of Object.entries((raw as any).words ?? {})) {
      out[ch] = (list as any[]).map((w) => (w as any).word as string);
    }
  }
  wordsCache = out;
  return out;
}

/** 给字谱附加组词(取词频最高的前 max 个), 无组词数据的字原样返回 */
export function attachWords(chars: CharSpec[], max = 3): CharSpec[] {
  const wmap = loadWords();
  return chars.map((c) => {
    const words = wmap[c.char] ?? [];
    if (words.length === 0) return c;
    return { ...c, words: words.slice(0, max) };
  });
}

/** 12 册教材顺序(用于累计"已学字"集合) */
const BOOK_ORDER = [
  'y一年级上册', 'y一年级下册', 'y二年级上册', 'y二年级下册',
  'y三年级上册', 'y三年级下册', 'y四年级上册', 'y四年级下册',
  'y五年级上册', 'y五年级下册', 'y六年级上册', 'y六年级下册',
] as const;

let bookCharsCache: Map<string, Set<string>> | null = null;

function buildBookChars(): Map<string, Set<string>> {
  if (bookCharsCache) return bookCharsCache;
  bookCharsCache = new Map();
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!/^y.*\.json$/.test(f)) continue;
    const key = f.replace('.json', '');
    const set = new Set<string>();
    const book = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
    for (const table of Object.values(book.tables ?? {}) as any[]) {
      for (const lesson of table.lessons ?? []) {
        for (const c of lesson.chars ?? []) set.add(c.char);
      }
      for (const g of table.gardens ?? []) {
        for (const c of g.chars ?? []) set.add(c.char);
      }
    }
    bookCharsCache.set(key, set);
  }
  return bookCharsCache;
}

/** 截至 learnedBook(含该册) 的累计已学字集合 */
export function learnedCharSet(learnedBook: string): Set<string> {
  const books = buildBookChars();
  const idx = BOOK_ORDER.indexOf(learnedBook as (typeof BOOK_ORDER)[number]);
  const learned = new Set<string>();
  if (idx >= 0) {
    for (let i = 0; i <= idx; i++) {
      const bk = BOOK_ORDER[i];
      if (bk) for (const c of books.get(bk) ?? []) learned.add(c);
    }
  }
  return learned;
}

/** 练字选项/口语指令词(这些不是要练的字, 提取前剔除) */
const STRIP_PATTERN =
  /米字格|田字格|无格|方格|不要拼音|无拼音|不带拼音|带拼音|要拼音|不要笔画数|不要笔画|不带笔画|带笔画数|带笔画|要笔画|不要描红|带描红|要描红|描红|不要练习格|不要练习|无练习格|只要例字|不要空格|每\s*个?\s*字\s*写?\s*[0-9一二三四五六七八九十]*\s*(?:个|遍|次|行)?|带组词|要组词|组词|带笔顺|要笔顺|笔顺|练字帖|帮我|请生成|生成|打印|制作|一份|一个|字帖/g;

/** pinyin-pro 输出是否为合法带调拼音(未知字会原样返回汉字) */
const PINYIN_RE = /^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+$/;
function isPinyin(s: unknown): s is string {
  return typeof s === 'string' && PINYIN_RE.test(s);
}

export interface TextCharsResult {
  chars: CharSpec[];
  /** 原文中各字出现次数(用于提示重复字) */
  repeats: Record<string, number>;
  /** 无法获得拼音的字(生字表与 pinyin-pro 均未覆盖) */
  uncovered: string[];
}

/** 提取文本中的汉字 → 去重(按首现顺序) → 上下文拼音 + 生字表笔画 */
export function textToChars(text: string): TextCharsResult {
  const map = buildCharMap();
  const cleaned = text
    .replace(STRIP_PATTERN, ' ')
    .replace(/[^\u4e00-\u9fff]/g, '');

  const repeats: Record<string, number> = {};
  for (const ch of cleaned) repeats[ch] = (repeats[ch] ?? 0) + 1;

  // 整段一次性转拼音, 保留上下文(多音字按词定音)
  const ctxPys = cleaned
    ? (pinyin(cleaned, { toneType: 'symbol', type: 'array' }) as unknown as string[])
    : [];

  const chars: CharSpec[] = [];
  const uncovered: string[] = [];
  const seen = new Set<string>();
  let i = 0;
  for (const ch of cleaned) {
    const ctxPy: unknown = ctxPys[i];
    i++;
    if (seen.has(ch)) continue;
    seen.add(ch);
    const info = map.get(ch);
    let py: string | undefined;
    if (isPinyin(ctxPy)) py = ctxPy;
    else if (info?.pinyin) py = info.pinyin.toLowerCase();
    const spec: CharSpec = { char: ch };
    if (py !== undefined) spec.pinyin = py;
    if (info?.strokes !== undefined) spec.strokes = info.strokes;
    chars.push(spec);
    if (py === undefined) uncovered.push(ch);
  }
  return { chars, repeats, uncovered };
}

export interface UnlearnedCharsResult extends TextCharsResult {
  /** 截至 learnedBook 的累计已学唯一字数 */
  learnedCount: number;
}

/** 从未学集合的角度提取文本中的字: 只保留截至 learnedBook 还没学过的字 */
export function unlearnedChars(text: string, learnedBook: string): UnlearnedCharsResult {
  const { chars, repeats } = textToChars(text);
  const learned = learnedCharSet(learnedBook);
  const filtered = chars.filter((c) => !learned.has(c.char));
  return {
    chars: filtered,
    repeats,
    uncovered: filtered.filter((c) => !c.pinyin).map((c) => c.char),
    learnedCount: learned.size,
  };
}
