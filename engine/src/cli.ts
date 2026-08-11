import { parse } from './parse.js';
import { llmParse } from './llm.js';
import { generateCopybook, type CharSpec } from './index.js';
import { textToChars, unlearnedChars } from './text.js';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(import.meta.dirname, '../../data/final');
const FONT_PATH = path.resolve(import.meta.dirname, '../fonts/LXGWWenKai-Regular.ttf');
const LATIN_FONT_PATH = 'fonts/DejaVuSans.ttf';
const OUT_DIR = path.resolve(import.meta.dirname, '../out');

async function main() {
  const args = process.argv.slice(2);
  const noLlm = args.includes('--no-llm');
  const realArgs = args.filter(a => a !== '--no-llm');
  if (realArgs.length === 0) {
    console.log('用法: npx tsx src/cli.ts "<指令>" [--no-llm]');
    console.log('示例: npx tsx src/cli.ts "一年级上册第五课"');
    process.exit(0);
  }

  const input = realArgs.join(' ');
  console.log(`\n输入: ${input}`);

  let parsed = parse(input);
  let source = '规则';

  if (parsed.error) {
    if (noLlm) {
      console.log('\n解析结果:');
      console.log(JSON.stringify(parsed, null, 2));
      console.log(`\n错误: ${parsed.error}`);
      process.exit(1);
    }
    console.log('\n规则解析失败, 尝试 AI 解析...');
    const llmResult = await llmParse(input);
    if (!llmResult) {
      console.log('\n解析结果:');
      console.log(JSON.stringify(parsed, null, 2));
      console.log(`\n错误: ${parsed.error}`);
      process.exit(1);
    }
    parsed = llmResult;
    source = 'AI';
    console.log('已通过 AI 解析');
  }

  console.log(`\n解析来源: ${source}`);
  console.log('解析结果:');
  console.log(JSON.stringify(parsed, null, 2));

  if (parsed.error) {
    console.log(`\n错误: ${parsed.error}`);
    process.exit(1);
  }

  if (parsed.mode === 'text' || parsed.mode === 'unlearned') {
    let chars;
    let repeats;
    let uncovered;
    let learnedCount: number | undefined;
    if (parsed.mode === 'unlearned' && parsed.learnedBook) {
      const r = unlearnedChars(parsed.text ?? '', parsed.learnedBook);
      chars = r.chars; repeats = r.repeats; uncovered = r.uncovered; learnedCount = r.learnedCount;
    } else {
      const r = textToChars(parsed.text ?? '');
      chars = r.chars; repeats = r.repeats; uncovered = r.uncovered;
    }
    if (chars.length === 0) {
      console.log('\n错误: 没有提取到要练的汉字');
      process.exit(1);
    }
    const repeatDesc = Object.entries(repeats)
      .filter(([, n]) => (n as number) > 1)
      .map(([c, n]) => `${c}×${n}`)
      .join(' ');
    const modeDesc = parsed.mode === 'unlearned'
      ? `未学字 ${chars.length} 字 (已学集合 ${learnedCount} 字)`
      : `文本练字 ${chars.length} 字`;
    console.log(`\n课信息: ${modeDesc}${repeatDesc ? ` (重复: ${repeatDesc})` : ''}`);
    if (uncovered.length > 0) {
      console.log(`提示: ${uncovered.length} 字暂无拼音/笔画数据, 不显示拼音: ${uncovered.join('')}`);
    }
    console.log(`字列表: ${chars.map(c => c.char).join('')}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeTitle = parsed.title.replace(/[^\w\u4e00-\u9fa5]/g, '_').slice(0, 30);
    const outFile = path.join(OUT_DIR, `cli-${safeTitle}-${timestamp}.pdf`);

    const pdf = await generateCopybook({
      title: parsed.title,
      chars,
      grid: parsed.grid,
      showPinyin: parsed.showPinyin,
      showStrokeCount: parsed.showStrokeCount,
      fontPath: FONT_PATH,
      latinFontPath: LATIN_FONT_PATH,
    });
    fs.writeFileSync(outFile, pdf);
    const fileSize = pdf.length;
    console.log(`\n生成成功: ${outFile}`);
    console.log(`文件大小: ${fileSize} bytes (${(fileSize / 1024).toFixed(1)} KB)`);
    process.exit(0);
  }

  if (!parsed.book) {
    console.log('\n错误: 无法确定册别');
    process.exit(1);
  }

  const dataFile = path.join(DATA_DIR, `${parsed.book}.json`);
  if (!fs.existsSync(dataFile)) {
    console.log(`\n错误: 数据文件不存在: ${dataFile}`);
    process.exit(1);
  }

  const bookData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  const table = bookData.tables?.[parsed.table];
  if (!table) {
    console.log(`\n错误: 该册没有${parsed.table === 'xiezi' ? '写字表' : '识字表'}`);
    process.exit(1);
  }

  let chars: CharSpec[] = [];
  let lessonInfo = '';

  if (parsed.lessonFilter === 'ALL') {
    const allLessons = table.lessons;
    chars = allLessons.flatMap((l: any) =>
      l.chars.map((c: any) => ({ char: c.char, pinyin: c.pinyin, strokes: c.strokes }))
    );
    lessonInfo = `全册 ${allLessons.length} 课, ${chars.length} 字`;
  } else {
    const filter = parsed.lessonFilter;
    let matchedLessons: any[] = [];

    if (filter.no !== undefined) {
      const byNo = table.lessons.filter((l: any) => l.no === filter.no);
      if (byNo.length === 0) {
        console.log(`\n错误: 该册数据中未找到第${filter.no}课`);
        process.exit(1);
      }

      if (filter.type) {
        matchedLessons = byNo.filter((l: any) => l.type === filter.type);
        if (matchedLessons.length === 0) {
          matchedLessons = byNo;
        }
      } else {
        if (byNo.length > 1) {
          const withType = byNo.filter((l: any) => l.type !== null);
          if (withType.length > 0) {
            const keWen = withType.find((l: any) => l.type === '课文');
            matchedLessons = keWen ? [keWen] : [withType[0]];
          } else {
            matchedLessons = [byNo[0]];
          }
        } else {
          matchedLessons = byNo;
        }
      }
    } else if (filter.title) {
      console.log(`\n提示: 标题匹配"${filter.title}"暂不支持, 请使用课号`);
      process.exit(1);
    }

    chars = matchedLessons.flatMap((l: any) =>
      l.chars.map((c: any) => ({ char: c.char, pinyin: c.pinyin, strokes: c.strokes }))
    );

    const lessonNos = matchedLessons.map((l: any) => l.no);
    const lessonTypes = matchedLessons.map((l: any) => l.type || '默认');
    lessonInfo = `第${lessonNos.join(',')}课 (${lessonTypes.join(',')}), ${chars.length} 字`;
  }

  console.log(`\n课信息: ${lessonInfo}`);
  console.log(`字列表: ${chars.slice(0, 20).map(c => c.char).join('')}${chars.length > 20 ? '...' : ''}`);

  if (chars.length === 0) {
    console.log('\n错误: 没有找到要生成的字');
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeTitle = parsed.title.replace(/[^\w\u4e00-\u9fa5]/g, '_').slice(0, 30);
  const outFile = path.join(OUT_DIR, `cli-${safeTitle}-${timestamp}.pdf`);

  const pdf = await generateCopybook({
    title: parsed.title,
    chars,
    grid: parsed.grid,
    showPinyin: parsed.showPinyin,
    showStrokeCount: parsed.showStrokeCount,
    fontPath: FONT_PATH,
    latinFontPath: LATIN_FONT_PATH,
  });

  fs.writeFileSync(outFile, pdf);
  const fileSize = pdf.length;
  console.log(`\n生成成功: ${outFile}`);
  console.log(`文件大小: ${fileSize} bytes (${(fileSize / 1024).toFixed(1)} KB)`);
}

main().catch(e => {
  console.error('错误:', e);
  process.exit(1);
});
