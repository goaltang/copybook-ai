// 示例: 用一年级上册课文1(秋天)写字表生成字帖 PDF
import { generateCopybook, type CharSpec } from './src/index.js';
import fs from 'node:fs';

async function main() {
  const book = JSON.parse(fs.readFileSync('../data/final/y一年级上册.json', 'utf-8'));

  // 课文1 会写字: 了 子 人 大
  const chars: CharSpec[] = book.tables.xiezi.lessons
    .filter((l: any) => l.no === 1)
    .flatMap((l: any) => l.chars)
    .map((c: any) => ({
      char: c.char as string,
      pinyin: (c.pinyin as string | undefined)?.toLowerCase(),
      strokes: c.strokes as number | undefined,
    }));
  console.log('课文1 会写字:', chars.map(c => `${c.char}(${c.pinyin})`).join(' '));

  const pdf = await generateCopybook({
    title: '一年级上册  第1课《秋天》会写字',
    chars,
    grid: 'tian',
    showPinyin: true,
    showStrokeCount: true,
    fontPath: 'fonts/LXGWWenKai-Regular.ttf',
    latinFontPath: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  });
  fs.writeFileSync('out/课文1-秋天-田字格.pdf', pdf);
  console.log('生成成功: out/课文1-秋天-田字格.pdf', pdf.length, 'bytes');

  // 全册 100 字 米字格(演示分页)
  const allChars = book.tables.xiezi.lessons.flatMap((l: any) => l.chars)
    .map((c: any) => ({ char: c.char, pinyin: c.pinyin, strokes: c.strokes }));
  const pdf2 = await generateCopybook({
    title: '一年级上册  全册会写字(100字)',
    chars: allChars,
    grid: 'mi',
    showPinyin: true,
    showStrokeCount: true,
    fontPath: 'fonts/LXGWWenKai-Regular.ttf',
    latinFontPath: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  });
  fs.writeFileSync('out/一年级上册-全册-米字格.pdf', pdf2);
  console.log('生成成功: out/一年级上册-全册-米字格.pdf', pdf2.length, 'bytes');
}

main().catch(e => { console.error(e); process.exit(1); });
