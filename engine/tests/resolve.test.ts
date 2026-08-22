/**
 * resolve.ts 共享解析层单测
 * 覆盖: 课定位字谱(拼音小写) / 未学字零结果的友好提示 / 标题匹配不支持提示
 */
import { describe, it, expect } from 'vitest';
import { resolveChars } from '../src/resolve.js';
import { parse } from '../src/parse.js';

describe('resolveChars 课号模式', () => {
  it('一年级上册第5课 → 虫/云/山, 拼音小写', () => {
    const r = resolveChars(parse('一年级上册第五课'));
    expect(r.error).toBeUndefined();
    expect(r.chars.map((c) => c.char).join('')).toBe('虫云山');
    expect(r.chars.map((c) => c.pinyin).join('/')).toBe('chóng/yún/shān');
  });

  it('课号不存在 → 明确报错', () => {
    const r = resolveChars(parse('一年级上册第20课'));
    expect(r.error).toContain('未找到第20课');
  });

  it('无法解析的课号(99) → parse 报错而非静默全册', () => {
    const r = parse('一年级上册第99课');
    expect(r.error).toContain('无法识别的课号');
  });
});

describe('resolveChars 文本/未学字模式', () => {
  it('未学字零结果 → 友好提示(引导用课号)', () => {
    const r = resolveChars(parse('一年级上册 秋天'));
    expect(r.chars.length).toBe(0);
    expect(r.error).toContain('均已学至');
    expect(r.error).toContain('课号');
  });

  it('文本模式正常 → 描述含字数', () => {
    const r = resolveChars(parse('春眠不觉晓'));
    expect(r.error).toBeUndefined();
    expect(r.desc).toContain('5 字');
  });
});
