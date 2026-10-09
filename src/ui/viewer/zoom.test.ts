import { bounds, clampScale, layoutPages, MAX_SCALE, MIN_SCALE, PAGE_GAP, visiblePages, zoomAround } from './zoom';

describe('viewer geometry', () => {
  it('scale is limited to [1, 5] (zooming out returns to fit-width)', () => {
    expect(clampScale(0.3)).toBe(MIN_SCALE);
    expect(clampScale(9)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });

  it('bounds: at fit-width no horizontal movement; tall content scrolls; zoomed content pans both ways', () => {
    expect(bounds(1, 400, 800, 400, 3000)).toEqual({ minX: 0, maxX: 0, minY: -2200, maxY: 0 });
    expect(bounds(2, 400, 800, 400, 3000)).toEqual({ minX: -400, maxX: 0, minY: -5200, maxY: 0 });
  });

  it('bounds: content shorter than the viewport is centered vertically', () => {
    expect(bounds(1, 400, 800, 400, 300)).toEqual({ minX: 0, maxX: 0, minY: 250, maxY: 250 });
  });

  it('pinch keeps the point under the fingers fixed', () => {
    // Content point under (100, 200) at scale 1, translation (0, -50) is (100, 250).
    const t = zoomAround(1, 0, -50, 2, 100, 200, 100, 200);
    expect(t).toEqual({ x: -100, y: -300 });
    expect((100 - t.x) / 2).toBe(100);
    expect((200 - t.y) / 2).toBe(250);
    // Moving the fingers while pinching pans as well.
    expect(zoomAround(1, 0, 0, 1, 100, 100, 130, 80)).toEqual({ x: 30, y: -20 });
  });

  it('pages are stacked at the viewport width with gaps; visibility follows scroll and zoom', () => {
    const { tops, heights, total } = layoutPages([{ width: 100, height: 200 }, { width: 100, height: 200 }, { width: 200, height: 100 }], 216);
    expect(heights).toEqual([400, 400, 100]);
    expect(tops).toEqual([PAGE_GAP, 416, 824]);
    expect(total).toBe(932);
    expect(visiblePages(tops, heights, 1, 0, 300)).toEqual([0, 0, 0]);
    expect(visiblePages(tops, heights, 1, -500, 300)).toEqual([1, 1, 1]);
    expect(visiblePages(tops, heights, 1, -650, 300)).toEqual([1, 2, 1]);
    expect(visiblePages(tops, heights, 2, -1700, 300)).toEqual([2, 2, 2]);
  });

  it('the current page is the one at the viewport center, not the first sliver at the top', () => {
    const { tops, heights } = layoutPages([{ width: 100, height: 200 }, { width: 100, height: 200 }, { width: 100, height: 200 }], 216);
    // Viewport 300 high scrolled to y = 400..700: a sliver of page 0 at the top, page 1 fills the rest.
    expect(visiblePages(tops, heights, 1, -400, 300)).toEqual([0, 1, 1]);
    expect(visiblePages([], [], 1, 0, 300)).toEqual([-1, -1, -1]);
  });
});
