/**
 * text.ts 任意文本→字谱管线单测
 * 覆盖: 汉字提取 / 标点空白剔除 / 样式词剔除 / 去重保序 / 未覆盖字提示
 */
import { describe, it, expect } from 'vitest';
import { textToChars } from '../src/text.js';

describe('textToChars 文本→字谱', () => {
  it('提取汉字, 剔除标点空白', () => {
    const { chars } = textToChars('春眠不觉晓, 处处闻啼鸟!');
    expect(chars.length).toBe(9); // 处 去重
    expect(chars[0]?.char).toBe('春');
    expect(chars.map((c) => c.char).join('')).toBe('春眠不觉晓处闻啼鸟');
  });

  it('去重保序(首现顺序), 并记录重复次数', () => {
    const { chars, repeats } = textToChars('处处闻啼鸟');
    expect(chars.map((c) => c.char).join('')).toBe('处闻啼鸟');
    expect(repeats['处']).toBe(2);
  });

  it('剔除样式词(米字格/不要拼音等)', () => {
    const { chars } = textToChars('春眠不觉晓 米字格 不要拼音');
    expect(chars.some((c) => c.char === '米' || c.char === '格')).toBe(false);
    expect(chars.map((c) => c.char).join('')).toBe('春眠不觉晓');
  });

  it('生字表内的字带拼音和笔画', () => {
    const { chars } = textToChars('春天');
    const chun = chars.find((c) => c.char === '春');
    expect(chun?.pinyin).toBeDefined();
    expect(chun?.strokes).toBeGreaterThan(0);
  });

  it('生字表未覆盖的字进 uncovered 且无拼音', () => {
    const { uncovered } = textToChars('龘');
    expect(uncovered.length).toBe(1);
    expect(uncovered[0]).toBe('龘');
  });

  it('空文本/无汉字 → 空结果', () => {
    const { chars } = textToChars('!!! 123 abc');
    expect(chars.length).toBe(0);
  });
});
