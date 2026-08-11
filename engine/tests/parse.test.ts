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

  it('异常输入: "abc!!!" → 返回 error(无汉字且无册别)', () => {
    const r = parse('abc!!!');
    expect(r.error).toContain('无法识别的指令');
    expect(r.book).toBeUndefined();
  });

  it('任意中文无课式关键词 → 文本模式(不再报错)', () => {
    const r = parse('今天天气不错');
    expect(r.error).toBeUndefined();
    expect(r.mode).toBe('text');
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

  it('任意文本模式: "春眠不觉晓" → mode=text, 无错误', () => {
    const r = parse('春眠不觉晓');
    expect(r.error).toBeUndefined();
    expect(r.mode).toBe('text');
    expect(r.text).toBe('春眠不觉晓');
    expect(r.title).toContain('练字帖');
  });

  it('任意文本模式 + 样式: "春眠不觉晓 米字格 不要拼音" → 米字格+无拼音', () => {
    const r = parse('春眠不觉晓 米字格 不要拼音');
    expect(r.error).toBeUndefined();
    expect(r.mode).toBe('text');
    expect(r.grid).toBe('mi');
    expect(r.showPinyin).toBe(false);
  });

  it('未学字模式: "春眠不觉晓 二年级" → mode=unlearned, learnedBook=y二年级上册(默认上册)', () => {
    const r = parse('春眠不觉晓 二年级');
    expect(r.error).toBeUndefined();
    expect(r.mode).toBe('unlearned');
    expect(r.learnedBook).toBe('y二年级上册');
    expect(r.title).toContain('未学字');
  });

  it('未学字模式(带册, 年级前置): "二年级下册 春眠不觉晓" → learnedBook=y二年级下册', () => {
    const r = parse('二年级下册 春眠不觉晓');
    expect(r.error).toBeUndefined();
    expect(r.mode).toBe('unlearned');
    expect(r.learnedBook).toBe('y二年级下册');
  });

  it('未学字模式 + 样式: "春眠不觉晓 三年级 米字格" → 米字格', () => {
    const r = parse('春眠不觉晓 三年级 米字格');
    expect(r.mode).toBe('unlearned');
    expect(r.learnedBook).toBe('y三年级上册');
    expect(r.grid).toBe('mi');
  });

  it('带组词: "一年级上册第3课 带组词" → showWords=true', () => {
    const r = parse('一年级上册第3课 带组词');
    expect(r.error).toBeUndefined();
    expect(r.showWords).toBe(true);
  });

  it('文本模式带组词: "春眠不觉晓 组词" → showWords=true', () => {
    const r = parse('春眠不觉晓 组词');
    expect(r.mode).toBe('text');
    expect(r.showWords).toBe(true);
  });

  it('含课式关键词仍走老路径: "今晚作业默写第8课词语" → 不进入文本模式', () => {
    const r = parse('今晚作业默写第8课词语');
    expect(r.mode).not.toBe('text');
    expect(r.error).toBeDefined(); // 留给 LLM 兜底
  });

  it('纯英文/符号 → 报错(非文本模式)', () => {
    const r = parse('hello world');
    expect(r.mode).not.toBe('text');
    expect(r.error).toBeDefined();
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
    await expect(runCli(['abc!!!', '--no-llm'])).rejects.toThrow();
  }, 60_000);

  it('文本+年级 + --no-llm → 未学字字帖生成成功', async () => {
    const { stdout } = await runCli(['春眠不觉晓 二年级', '--no-llm']);
    expect(stdout).toContain('未学字');
    expect(stdout).toContain('生成成功');
  }, 90_000);
});
