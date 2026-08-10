/**
 * parse.ts 规则解析器单测 (P5)
 * 覆盖: 精确课定位 / 年级+课 / 自由表达兜底 / 异常输入 / 全册 / 样式选项 / --no-llm 集成路径
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../src/parse.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const ENGINE_ROOT = path.resolve(import.meta.dirname, '..');

describe('parse 规则解析器', () => {
  it('精确课定位: "一年级上册第五课" → 一年级上册 第5课 写字表', () => {
    const r = parse('一年级上册第五课');
    expect(r.error).toBeUndefined();
    expect(r.book).toBe('y一年级上册');
    expect(r.table).toBe('xiezi');
    expect(r.lessonFilter).toEqual({ no: 5 });
    expect(r.title).toContain('第5课');
  });

  it('年级+课: "二年级下册 识字 第5课" → 二年级下册 识字表 第5课', () => {
    const r = parse('二年级下册 识字 第5课');
    expect(r.error).toBeUndefined();
    expect(r.book).toBe('y二年级下册');
    expect(r.table).toBe('shizi');
    expect(r.lessonFilter).toEqual({ no: 5 });
  });

  it('年级+课(阿拉伯数字): "3年级上册 第2课" → 三年级上册 第2课', () => {
    const r = parse('3年级上册 第2课');
    expect(r.error).toBeUndefined();
    expect(r.book).toBe('y三年级上册');
    expect(r.lessonFilter).toEqual({ no: 2 });
  });

  it('自由表达兜底: "帮我做一份三年级上册第一课的练字帖" → 第1课', () => {
    const r = parse('帮我做一份三年级上册第一课的练字帖');
    expect(r.error).toBeUndefined();
    expect(r.book).toBe('y三年级上册');
    expect(r.lessonFilter).toEqual({ no: 1 });
  });

  it('异常输入: "今天天气不错" → 返回 error', () => {
    const r = parse('今天天气不错');
    expect(r.error).toContain('无法识别的指令');
    expect(r.book).toBeUndefined();
  });

  it('空输入 → 返回 error(空)', () => {
    const r = parse('   ');
    expect(r.error).toContain('(空)');
  });

  it('全册: "一年级上册全册" → lessonFilter=ALL, 标题含"全部"', () => {
    const r = parse('一年级上册全册');
    expect(r.book).toBe('y一年级上册');
    expect(r.lessonFilter).toBe('ALL');
    expect(r.title).toContain('全部');
  });

  it('样式选项: "四年级上册 第3课 米字格 不要拼音" → 米字格+无拼音', () => {
    const r = parse('四年级上册 第3课 米字格 不要拼音');
    expect(r.book).toBe('y四年级上册');
    expect(r.grid).toBe('mi');
    expect(r.showPinyin).toBe(false);
    expect(r.showStrokeCount).toBe(true);
  });
});

describe('CLI --no-llm 路径(集成)', () => {
  const runCli = (args: string[]) =>
    execFileAsync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
      cwd: ENGINE_ROOT,
      timeout: 60_000,
      encoding: 'utf-8',
    });

  it('合法输入 + --no-llm → 生成成功(规则解析)', async () => {
    const { stdout } = await runCli(['一年级上册第五课', '--no-llm']);
    expect(stdout).toContain('解析来源: 规则');
    expect(stdout).toContain('生成成功');
  }, 90_000);

  it('无法识别的输入 + --no-llm → 报错退出(不调 LLM)', async () => {
    await expect(runCli(['今天天气不错', '--no-llm'])).rejects.toThrow();
  }, 60_000);
});
