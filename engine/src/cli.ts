import { parse } from './parse.js';
import { llmParse } from './llm.js';
import { resolveChars, buildPdf } from './resolve.js';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(import.meta.dirname, '../out');

async function main() {
  const args = process.argv.slice(2);
  const noLlm = args.includes('--no-llm');
  const realArgs = args.filter(a => a !== '--no-llm');
  if (realArgs.length === 0) {
    console.log('用法: npx tsx src/cli.ts "<指令>" [--no-llm]');
    console.log('示例: npx tsx src/cli.ts "一年级上册第五课 带描红"');
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

  const resolved = resolveChars(parsed);
  if (resolved.error) {
    console.log(`\n错误: ${resolved.error}`);
    process.exit(1);
  }

  console.log(`\n课信息: ${resolved.desc}`);
  if (resolved.uncovered && resolved.uncovered.length > 0) {
    console.log(`提示: ${resolved.uncovered.length} 字暂无拼音数据, 不显示拼音: ${resolved.uncovered.join('')}`);
  }
  console.log(`字列表: ${resolved.chars.slice(0, 30).map(c => c.char).join('')}${resolved.chars.length > 30 ? '...' : ''}`);

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeTitle = parsed.title.replace(/[^\w\u4e00-\u9fa5]/g, '_').slice(0, 30);
  const outFile = path.join(OUT_DIR, `cli-${safeTitle}-${timestamp}.pdf`);

  const pdf = await buildPdf(parsed, resolved.chars);
  fs.writeFileSync(outFile, pdf);
  console.log(`\n生成成功: ${outFile}`);
  console.log(`文件大小: ${pdf.length} bytes (${(pdf.length / 1024).toFixed(1)} KB)`);
}

main().catch(e => {
  console.error('错误:', e);
  process.exit(1);
});
