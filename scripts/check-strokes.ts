/**
 * 笔顺数据校验脚本 (P2)
 * 校验 data/final/strokes.json 对生字表的覆盖率 (目标 >95%, 多音字/生僻字缺失正常)
 * 同时校验笔画名数量与生字表笔画数字段一致
 * 用法: cd engine && npx tsx ../scripts/check-strokes.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(import.meta.dirname, '../data/final');

// 1. 收集生字表全部唯一字 + 笔画数
const charMap = new Map<string, number>(); // char -> strokes
for (const f of fs.readdirSync(DATA_DIR)) {
  if (!/^y.*\.json$/.test(f)) continue;
  const book = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
  const tables = book.tables ?? {};
  for (const table of Object.values(tables) as any[]) {
    for (const lesson of table.lessons ?? []) {
      for (const c of lesson.chars ?? []) {
        if (c.char) charMap.set(c.char, c.strokes);
      }
    }
    for (const garden of table.gardens ?? []) {
      for (const c of garden.chars ?? []) {
        if (c.char) charMap.set(c.char, c.strokes);
      }
    }
  }
}

// 2. 加载 strokes.json
const strokesFile = path.join(DATA_DIR, 'strokes.json');
if (!fs.existsSync(strokesFile)) {
  console.error('错误: data/final/strokes.json 不存在, 请先运行 data/build-strokes.py');
  process.exit(1);
}
const strokesData = JSON.parse(fs.readFileSync(strokesFile, 'utf-8'));
const strokes: Record<string, any> = strokesData.strokes ?? {};

// 3. 统计
let withNames = 0;
let withPaths = 0;
let countMismatch = 0;
const missing: string[] = [];
const mismatchList: string[] = [];

for (const [ch, expected] of charMap) {
  const entry = strokes[ch];
  if (!entry) {
    missing.push(ch);
    continue;
  }
  if (entry.names?.length) withNames++;
  if (entry.paths?.length) withPaths++;
  if (entry.names && expected != null && entry.names.length !== expected) {
    countMismatch++;
    if (mismatchList.length < 20) mismatchList.push(`${ch}(笔画名${entry.names.length} vs 表内${expected})`);
  }
}

const total = charMap.size;
const pct = (n: number) => (n / total * 100).toFixed(2);

console.log('===== 笔顺数据校验报告 (check-strokes) =====');
console.log(`生字表唯一字: ${total}`);
console.log(`有笔画名: ${withNames} (${pct(withNames)}%)  [目标 >95%]`);
console.log(`有矢量路径: ${withPaths} (${pct(withPaths)}%)`);
console.log(`笔画数不一致: ${countMismatch}${countMismatch ? ' ' + mismatchList.join(' ') : ''}`);
console.log(`缺失: ${missing.length}${missing.length ? ' ' + missing.slice(0, 20).join(' ') : ''}`);

const pass = withNames / total > 0.95;
console.log(`\n结论: ${pass ? '✅ 通过' : '❌ 未达标'} (笔画名覆盖率 ${pct(withNames)}%)`);
process.exit(pass ? 0 : 1);
