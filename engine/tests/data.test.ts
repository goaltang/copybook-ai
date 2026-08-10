/**
 * data/final 生字表数据结构完整性单测 (P5)
 * 校验: 每册表结构、每课非空、字段齐全、六年级无识字表、words/strokes 配套数据
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(import.meta.dirname, '../../data/final');

function loadBooks(): any[] {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^y.*\.json$/.test(f))
    .sort()
    .map((f) => {
      const book = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
      return { file: f, book };
    });
}

describe('data/final 生字表结构完整性', () => {
  const books = loadBooks();
  it('存在 12 册数据文件', () => {
    expect(books.length).toBe(12);
  });

  it.each(books.map((b) => [b.file, b.book]))('%s: 结构完整', (_file, book) => {
    expect(typeof book.book).toBe('string');
    expect(book.book).toMatch(/^y[一二三四五六]年级[上下]册$/);
    const tables = book.tables;
    expect(tables).toBeDefined();
    const tableNames = Object.keys(tables);
    expect(tableNames.length).toBeGreaterThan(0);

    for (const tableName of tableNames) {
      const table = tables[tableName];
      expect(['shizi', 'xiezi']).toContain(tableName);
      // 每课非空、字段齐全
      for (const lesson of table.lessons ?? []) {
        expect(Number.isInteger(lesson.no)).toBe(true);
        expect(lesson.no).toBeGreaterThan(0);
        expect(Array.isArray(lesson.chars)).toBe(true);
        expect(lesson.chars.length).toBeGreaterThan(0);
        for (const c of lesson.chars) {
          expect(typeof c.char).toBe('string');
          expect(c.char.length).toBeGreaterThan(0);
          expect(typeof c.pinyin).toBe('string');
          expect(c.pinyin.length).toBeGreaterThan(0);
          expect(typeof c.strokes).toBe('number');
          expect(c.strokes).toBeGreaterThan(0);
          expect(typeof c.radical).toBe('string');
          expect(typeof c.structure).toBe('string');
        }
      }
      // 语文园地结构
      for (const garden of table.gardens ?? []) {
        expect(typeof garden.name).toBe('string');
        expect(Array.isArray(garden.chars)).toBe(true);
        for (const c of garden.chars) {
          expect(typeof c.char).toBe('string');
          expect(c.char.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('六年级两册没有识字表(与教材一致)', () => {
    for (const { book } of books) {
      if (book.book.startsWith('y六')) {
        expect(book.tables.shizi).toBeUndefined();
        expect(book.tables.xiezi).toBeDefined();
      }
    }
  });
});

describe('data/final 配套数据', () => {
  it('words.json: 每个生字都有组词(覆盖率 100%)', () => {
    const words = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'words.json'), 'utf-8'));
    expect(words.words).toBeDefined();
    const charSet = new Set<string>();
    for (const { book } of loadBooks()) {
      for (const table of Object.values(book.tables ?? {}) as any[]) {
        for (const lesson of table.lessons ?? []) {
          for (const c of lesson.chars) if (c.char) charSet.add(c.char);
        }
      }
    }
    const missing = [...charSet].filter((ch) => !(words.words[ch]?.length > 0));
    expect(missing).toEqual([]);
  });

  it('strokes.json: 每个生字都有笔画名序列', () => {
    const strokes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'strokes.json'), 'utf-8'));
    expect(strokes.strokes).toBeDefined();
    const charSet = new Set<string>();
    for (const { book } of loadBooks()) {
      for (const table of Object.values(book.tables ?? {}) as any[]) {
        for (const lesson of table.lessons ?? []) {
          for (const c of lesson.chars) if (c.char) charSet.add(c.char);
        }
      }
    }
    const missing = [...charSet].filter((ch) => {
      const e = strokes.strokes[ch];
      return !e || !Array.isArray(e.names) || e.names.length === 0;
    });
    expect(missing).toEqual([]);
  });
});
