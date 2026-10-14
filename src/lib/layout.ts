import { EXPORT_FALLBACK, VIEWPORT_STALE_MS } from "@/lib/constants";
import type { PublicPhoto, Rect, ViewportState } from "@/lib/types";

export type PlacedTile = {
  id: string;
  rect: Rect;
};

export type StageLayout = {
  stageWidth: number;
  stageHeight: number;
  center: Rect & { kind: "qr" | "hero" };
  tiles: PlacedTile[];
};

type PhotoBox = {
  id: string;
  width: number;
  height: number;
};

type Grid = {
  lines: number;
  // "rows" stacks horizontal lines top to bottom; "columns" places vertical lines side by side.
  axis: "rows" | "columns";
};

/**
 * Tiles the whole stage edge to edge with no gaps. The center item (QR or center
 * image) counts as one cell, so one item fills the screen, two split it 50:50,
 * three into thirds, and so on. The grid with the largest cells wins; a shorter
 * last line stretches its cells so no space is left empty.
 */
export function layoutBoard(input: {
  stageWidth: number;
  stageHeight: number;
  photos: PhotoBox[];
  hero: PhotoBox | null;
}): StageLayout {
  const stageWidth = Math.max(1, Math.round(input.stageWidth));
  const stageHeight = Math.max(1, Math.round(input.stageHeight));
  const kind = input.hero ? "hero" : "qr";
  const count = input.photos.length + 1;
  const cells = gridCells(stageWidth, stageHeight, count, bestGrid(stageWidth, stageHeight, count));

  const centerIndex = nearestToCenter(cells, stageWidth, stageHeight);
  const center = cells[centerIndex];
  const rest = cells.filter((_, index) => index !== centerIndex);

  return {
    stageWidth,
    stageHeight,
    center: { ...center, kind },
    tiles: input.photos.map((photo, index) => ({ id: photo.id, rect: rest[index] })),
  };
}

export function expandedRect(stageWidth: number, stageHeight: number, aspect: number): Rect {
  const safeAspect = aspect > 0 ? aspect : 1;
  const maxW = stageWidth * 0.92;
  const maxH = stageHeight * 0.92;
  let width = maxW;
  let height = width / safeAspect;
  if (height > maxH) {
    height = maxH;
    width = height * safeAspect;
  }
  return roundRect({
    left: (stageWidth - width) / 2,
    top: (stageHeight - height) / 2,
    width,
    height,
  });
}

export function containRect(rect: Rect, aspect: number): Rect {
  const safeAspect = aspect > 0 ? aspect : 1;
  let width = rect.width;
  let height = width / safeAspect;
  if (height > rect.height) {
    height = rect.height;
    width = height * safeAspect;
  }
  return roundRect({
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  });
}

export function exportStage(viewport: ViewportState | null, now = Date.now()) {
  if (
    !viewport ||
    now - viewport.updatedAt > VIEWPORT_STALE_MS ||
    viewport.width < 320 ||
    viewport.height < 320
  ) {
    return { ...EXPORT_FALLBACK, live: false as const };
  }
  return { width: viewport.width, height: viewport.height, live: true as const };
}

export function coverSource(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
) {
  const scale = Math.max(destWidth / sourceWidth, destHeight / sourceHeight);
  const sw = destWidth / scale;
  const sh = destHeight / scale;
  return {
    sx: (sourceWidth - sw) / 2,
    sy: (sourceHeight - sh) / 2,
    sw,
    sh,
  };
}

export function photoAspect(photo: Pick<PublicPhoto, "width" | "height">): number {
  return photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;
}

function bestGrid(stageWidth: number, stageHeight: number, count: number): Grid {
  let best: Grid = { lines: 1, axis: stageWidth >= stageHeight ? "rows" : "columns" };
  let bestScore = -1;
  let bestEmpty = Infinity;
  const axes: Grid["axis"][] = stageWidth >= stageHeight ? ["rows", "columns"] : ["columns", "rows"];

  for (const axis of axes) {
    for (let lines = 1; lines <= count; lines += 1) {
      const perLine = Math.ceil(count / lines);
      const across = axis === "rows" ? stageWidth / perLine : stageWidth / lines;
      const down = axis === "rows" ? stageHeight / lines : stageHeight / perLine;
      // The smallest side of the smallest cell: that is what the QR and every crop live in.
      const score = Math.min(across, down);
      const empty = lines * perLine - count;
      if (score > bestScore + 0.5 || (Math.abs(score - bestScore) <= 0.5 && empty < bestEmpty)) {
        best = { lines, axis };
        bestScore = score;
        bestEmpty = empty;
      }
    }
  }
  return best;
}

function gridCells(stageWidth: number, stageHeight: number, count: number, grid: Grid): Rect[] {
  const { lines, axis } = grid;
  const base = Math.floor(count / lines);
  const extra = count % lines;
  const cells: Rect[] = [];
  const lineSpan = axis === "rows" ? stageHeight : stageWidth;
  const crossSpan = axis === "rows" ? stageWidth : stageHeight;

  for (let line = 0; line < lines; line += 1) {
    const items = base + (line < extra ? 1 : 0);
    const start = Math.round((line * lineSpan) / lines);
    const end = Math.round(((line + 1) * lineSpan) / lines);
    for (let item = 0; item < items; item += 1) {
      const from = Math.round((item * crossSpan) / items);
      const to = Math.round(((item + 1) * crossSpan) / items);
      cells.push(
        axis === "rows"
          ? { left: from, top: start, width: to - from, height: end - start }
          : { left: start, top: from, width: end - start, height: to - from },
      );
    }
  }
  return cells;
}

function nearestToCenter(cells: Rect[], stageWidth: number, stageHeight: number): number {
  let best = 0;
  let bestDistance = Infinity;
  cells.forEach((cell, index) => {
    const dx = cell.left + cell.width / 2 - stageWidth / 2;
    const dy = cell.top + cell.height / 2 - stageHeight / 2;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance - 0.5) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function roundRect(rect: Rect): Rect {
  const left = Math.round(rect.left);
  const top = Math.round(rect.top);
  const right = Math.round(rect.left + rect.width);
  const bottom = Math.round(rect.top + rect.height);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
