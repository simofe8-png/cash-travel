/**
 * Geometry of the document viewer (pure, runs as Reanimated worklets on the UI thread).
 * Content = pages stacked vertically at the viewport width; transform = translate(x, y) · scale(s)
 * with the origin at the content's top-left corner.
 */
export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
/** Double-tap zoom level. */
export const TAP_SCALE = 2.5;
/** Space between and around pages (dp, unscaled). */
export const PAGE_GAP = 8;

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
}

export function clampScale(s: number): number {
  'worklet';
  return clamp(s, MIN_SCALE, MAX_SCALE);
}

/** Allowed translations: content never leaves a gap at an edge; smaller content is centered. */
export function bounds(scale: number, viewW: number, viewH: number, contentW: number, contentH: number): Bounds {
  'worklet';
  const w = contentW * scale;
  const h = contentH * scale;
  const x = w <= viewW ? { lo: (viewW - w) / 2, hi: (viewW - w) / 2 } : { lo: viewW - w, hi: 0 };
  const y = h <= viewH ? { lo: (viewH - h) / 2, hi: (viewH - h) / 2 } : { lo: viewH - h, hi: 0 };
  return { minX: x.lo, maxX: x.hi, minY: y.lo, maxY: y.hi };
}

/**
 * Translation that keeps the content point under `from` (at scale s0, translation t0) under `to`
 * after scaling to s1 — pinch zoom around the fingers, including moving them while pinching.
 */
export function zoomAround(s0: number, t0x: number, t0y: number, s1: number, fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number } {
  'worklet';
  const k = s1 / s0;
  return { x: toX - (fromX - t0x) * k, y: toY - (fromY - t0y) * k };
}

/** Top offsets of pages laid out at width `viewW` with gaps; returns tops and the total height. */
export function layoutPages(pages: readonly { width: number; height: number }[], viewW: number): { tops: number[]; heights: number[]; total: number } {
  const tops: number[] = [];
  const heights: number[] = [];
  let y = PAGE_GAP;
  for (const p of pages) {
    const h = p.width > 0 ? ((viewW - 2 * PAGE_GAP) * p.height) / p.width : viewW;
    tops.push(y);
    heights.push(h);
    y += h + PAGE_GAP;
  }
  return { tops, heights, total: y };
}

/** Indices of the first and last page intersecting the viewport (−1, −1 when there are none). */
export function visiblePages(tops: readonly number[], heights: readonly number[], scale: number, ty: number, viewH: number): [number, number] {
  'worklet';
  const top = -ty / scale;
  const bottom = (viewH - ty) / scale;
  let first = -1;
  let last = -1;
  for (let i = 0; i < tops.length; i++) {
    const a = tops[i]!;
    const b = a + heights[i]!;
    if (b >= top && a <= bottom) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return [first, last];
}
