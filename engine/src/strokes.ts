/**
 * 笔顺数据访问与渲染辅助
 * 数据源: data/final/strokes.json (hanzi-writer-data + cnchar-order)
 * 路径为 SVG 格式(M/L/Q/C/Z, 原始坐标系约 0~1000, Y 向下)
 * 渲染: 借助 pdf-lib 的 drawSvgPath(内部自带 Y 翻转), 仅需几何变换
 */
import fs from 'node:fs';
import path from 'node:path';
import { rgb, type PDFPage } from 'pdf-lib';
import type { Color } from 'pdf-lib';

const DATA_DIR = path.resolve(import.meta.dirname, '../../data/final');

export interface StrokeData {
  /** 每笔笔画名(书写顺序) */
  names: string[];
  /** 每笔 SVG 路径(书写顺序) */
  paths: string[];
  /** 每笔走向折线(每笔为 [x,y] 点列, 用于定位笔序号) */
  medians: number[][][];
}

let strokeMap: Map<string, StrokeData> | null = null;

export function loadStrokeMap(): Map<string, StrokeData> {
  if (strokeMap) return strokeMap;
  strokeMap = new Map();
  const file = path.join(DATA_DIR, 'strokes.json');
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const [ch, d] of Object.entries((raw as any).strokes ?? {})) {
      const s = d as { names?: string[]; paths?: string[]; medians?: number[][][] };
      if (Array.isArray(s.paths) && s.paths.length > 0) {
        strokeMap.set(ch, {
          names: s.names ?? [],
          paths: s.paths,
          medians: s.medians ?? [],
        });
      }
    }
  }
  return strokeMap;
}

export interface BBox { minX: number; minY: number; maxX: number; maxY: number; }

/** 计算一组 SVG 路径的包围盒 */
export function strokeBBox(paths: string[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) {
    const nums = p.match(/-?\d+\.?\d*/g) ?? [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = parseFloat(nums[i]!);
      const y = parseFloat(nums[i + 1]!);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/**
 * hanzi-writer-data 的坐标是 y-UP(数学坐标, 大 y = 上方), 而 drawSvgPath 自带 y 翻转(scale(s,-s))
 * 故渲染前先把路径镜像成 y-down, 经 drawSvgPath 翻转后即为正立的 y-up 页面坐标
 */
export function flipPathY(svgPath: string, minY: number, maxY: number): string {
  const tokens = svgPath.match(/[MLQCZ]|-?\d+\.?\d*/g) ?? [];
  let numIdx = 0;
  const out: string[] = [];
  for (const t of tokens) {
    if (/[MLQCZ]/.test(t)) {
      out.push(t);
      continue;
    }
    const isY = numIdx % 2 === 1;
    numIdx++;
    out.push(isY ? String(minY + maxY - parseFloat(t)) : t);
  }
  return out.join(' ');
}

/**
 * drawSvgPath 变换: 路径点 (px,py) → (x + s*px, y - s*py)
 * 传入的路径已为 y-down(经 flipPathY), 故:
 *   数据顶部(原 maxY → flip 后 minY)映射到格子上沿: y = gy + gs + s*minY
 */
export function glyphTransform(
  bbox: BBox, gx: number, gy: number, gs: number, pad = 0.08,
): { x: number; y: number; scale: number } {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const scale = (gs * (1 - pad * 2)) / Math.max(w, h, 1);
  const x = gx + gs / 2 - scale * (bbox.minX + bbox.maxX) / 2;
  const y = gy + gs + scale * bbox.minY;
  return { x, y, scale };
}

/** 画单笔(或整个字的多笔)轮廓; 内部完成 y-up → y-down 镜像 */
export function drawStrokePath(
  page: PDFPage, svgPath: string, bbox: BBox, t: { x: number; y: number; scale: number },
  color: Color, width: number,
): void {
  try {
    const flipped = flipPathY(svgPath, bbox.minY, bbox.maxY);
    page.drawSvgPath(flipped, {
      x: t.x, y: t.y, scale: t.scale,
      borderColor: color, borderWidth: width,
    });
  } catch {
    // 个别异常路径跳过, 不影响整页
  }
}

/** 数据坐标( y-up) → 页面坐标( y-up) */
export function dataToPage(
  p: { x: number; y: number }, t: { x: number; y: number; scale: number }, bbox: BBox,
): { x: number; y: number } {
  const flippedY = bbox.minY + bbox.maxY - p.y;
  return { x: t.x + t.scale * p.x, y: t.y - t.scale * flippedY };
}

/** 每笔 medians 的中点(用于放置笔序号) */
export function medianMid(medians: number[][][]): { x: number; y: number }[] {
  return medians.map((pts) => {
    if (pts.length === 0) return { x: 0, y: 0 };
    let sx = 0, sy = 0;
    for (const [x, y] of pts) { sx += x ?? 0; sy += y ?? 0; }
    return { x: sx / pts.length, y: sy / pts.length };
  });
}
