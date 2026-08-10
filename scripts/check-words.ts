/**
 * 组词数据校验脚本 (P1)
 * 校验 data/final/words.json 对生字表的覆盖率 (单字词算覆盖, 目标 >90%)
 * 用法: cd engine && npx tsx ../scripts/check-words.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(import.meta.dirname, '../data/final');

// 1. 收集生字表全部唯一字
const charSet = new Set<string>();
const books: string[] = [];
for (const f of fs.readdirSync(DATA_DIR)) {
  if (!/^y.*\.json$/.test(f)) continue;
  books.push(f);
  const book = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
  const tables = book.tables ?? {};
  for (const table of Object.values(tables) as any[]) {
    for (const lesson of table.lessons ?? []) {
      for (const c of lesson.chars ?? []) {
        if (c.char) charSet.add(c.char);
      }
    }
    for (const garden of table.gardens ?? []) {
      for (const c of garden.chars ?? []) {
        if (c.char) charSet.add(c.char);
      }
    }
  }
}

// 2. 加载 words.json
const wordsFile = path.join(DATA_DIR, 'words.json');
if (!fs.existsSync(wordsFile)) {
  console.error('错误: data/final/words.json 不存在, 请先运行 data/build-words.py');
  process.exit(1);
}
const wordsData = JSON.parse(fs.readFileSync(wordsFile, 'utf-8'));
const wordMap: Record<string, any[]> = wordsData.words ?? {};

// 3. 覆盖率统计
let covered = 0;      // 至少 1 个词 (含单字词)
let coveredMulti = 0; // 至少 1 个多字词
const missing: string[] = [];
const singleOnly: string[] = [];

for (const ch of charSet) {
  const list = wordMap[ch] ?? [];
  const multi = list.filter((e: any) => e.word.length > 1);
  if (list.length > 0) covered++;
  if (multi.length > 0) coveredMulti++;
  else if (list.length === 0) missing.push(ch);
  else singleOnly.push(ch);
}

const total = charSet.size;
const pct = (n: number) => (n / total * 100).toFixed(2);

console.log('===== 组词数据校验报告 (check-words) =====');
console.log(`生字表文件数: ${books.length}`);
console.log(`生字表唯一字: ${total}`);
console.log(`有词覆盖(含单字词): ${covered} (${pct(covered)}%)  [目标 >90%]`);
console.log(`有多字组词: ${coveredMulti} (${pct(coveredMulti)}%)`);
console.log(`仅单字词兜底: ${singleOnly.length}`);
console.log(`完全无词: ${missing.length}`);
if (missing.length > 0) {
  console.log(`无词字: ${missing.slice(0, 30).join(' ')}${missing.length > 30 ? ' ...' : ''}`);
}
console.log(`words.json 词条数: ${Object.keys(wordMap).length}`);

const pass = covered / total > 0.9;
console.log(`\n结论: ${pass ? '✅ 通过' : '❌ 未达标'} (覆盖率 ${pct(covered)}%)`);
process.exit(pass ? 0 : 1);
