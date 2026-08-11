/**
 * strokes.ts 笔顺数据访问与几何变换单测
 */
import { describe, it, expect } from 'vitest';
import { loadStrokeMap, strokeBBox, glyphTransform, medianMid, flipPathY, dataToPage } from '../src/strokes.js';

describe('strokes 数据与几何', () => {
  it('loadStrokeMap: 覆盖 2980 字, 永=5 笔', () => {
    const map = loadStrokeMap();
    expect(map.size).toBe(2980);
    const yong = map.get('永');
    expect(yong?.paths.length).toBe(5);
    expect(yong?.names).toEqual(['点', '横折钩', '横撇|横钩', '撇', '捺']);
  });

  it('strokeBBox: 包围盒覆盖全部坐标点', () => {
    const map = loadStrokeMap();
    const tian = map.get('天')!;
    const b = strokeBBox(tian.paths);
    expect(b.minX).toBeLessThan(b.maxX);
    expect(b.minY).toBeLessThan(b.maxY);
    // 所有坐标都应在包围盒内
    for (const p of tian.paths) {
      const nums = p.match(/-?\d+\.?\d*/g) ?? [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = parseFloat(nums[i]!);
        const y = parseFloat(nums[i + 1]!);
        expect(x).toBeGreaterThanOrEqual(b.minX - 1e-6);
        expect(x).toBeLessThanOrEqual(b.maxX + 1e-6);
        expect(y).toBeGreaterThanOrEqual(b.minY - 1e-6);
        expect(y).toBeLessThanOrEqual(b.maxY + 1e-6);
      }
    }
  });

  it('glyphTransform + flipPathY: y-UP 数据经翻转后正立映射进目标格', () => {
    // 数据为 y-UP: maxY=顶部, minY=底部
    const b = { minX: 100, minY: 0, maxX: 900, maxY: 800 };
    const t = glyphTransform(b, 100, 100, 100, 0);
    const s = 100 / 800;
    expect(t.scale).toBeCloseTo(s, 5);
    // 经 flipPathY 后交给 drawSvgPath: 页面 y = t.y - s * y'(y' 为翻转后坐标)
    // 数据顶部(maxY)应映射到格子上沿 gy+gs=200
    const topY = t.y - s * (b.minY + b.maxY - b.maxY); // y' = minY+maxY-maxY = minY
    expect(topY).toBeCloseTo(200, 5);
    // 数据底部(minY)应映射到格子内部偏下
    const botY = t.y - s * (b.minY + b.maxY - b.minY); // y' = maxY
    expect(botY).toBeCloseTo(100, 5);
    // x 方向: 左边界贴格左, 右边界贴格右
    expect(t.x + s * b.minX).toBeCloseTo(100, 5);
    expect(t.x + s * b.maxX).toBeCloseTo(200, 5);
  });

  it('flipPathY: 仅翻转 y 坐标, 保持命令与 x', () => {
    const flipped = flipPathY('M 10 20 L 30 40 Q 50 60 70 80 Z', 0, 100);
    expect(flipped).toBe('M 10 80 L 30 60 Q 50 40 70 20 Z');
  });

  it('dataToPage: 数据坐标( y-up)映射到页面坐标( y-up)', () => {
    const b = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const t = { x: 0, y: 100, scale: 1 }; // gy=0, gs=100
    // 数据顶部 (y=100) → 页面顶部 (y=100)
    expect(dataToPage({ x: 50, y: 100 }, t, b).y).toBeCloseTo(100, 5);
    // 数据底部 (y=0) → 页面底部 (y=0)
    expect(dataToPage({ x: 50, y: 0 }, t, b).y).toBeCloseTo(0, 5);
  });

  it('medianMid: 返回每笔一个中点, 且在中位数点范围内', () => {
    const map = loadStrokeMap();
    const yong = map.get('永')!;
    const mids = medianMid(yong.medians);
    expect(mids.length).toBe(5);
    for (const m of mids) {
      expect(Number.isFinite(m.x)).toBe(true);
      expect(Number.isFinite(m.y)).toBe(true);
    }
  });
});
