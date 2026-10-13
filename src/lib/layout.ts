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

const ATTEMPTS = 24;

export function layoutBoard(input: {
  stageWidth: number;
  stageHeight: number;
  photos: PhotoBox[];
  hero: PhotoBox | null;
}): StageLayout {
  const stageWidth = Math.max(1, input.stageWidth);
  const stageHeight = Math.max(1, input.stageHeight);
  const shortSide = Math.min(stageWidth, stageHeight);
  const margin = Math.max(8, shortSide * 0.015);
  const count = input.photos.length;
  const qrPreferred = clamp(
    shortSide * 0.3,
    Math.min(220, shortSide * 0.45),
    Math.min(360, shortSide * 0.42),
  );

  if (count === 0) {
    const center = input.hero
      ? heroRect(stageWidth, stageHeight, input.hero, shortSide * 0.62)
      : squareRect(stageWidth, stageHeight, qrPreferred);
    return {
      stageWidth,
      stageHeight,
      center: { ...center, kind: input.hero ? "hero" : "qr" },
      tiles: [],
    };
  }

  const desired = clamp(0.3 * Math.pow(count, -0.4), 0.055, 0.26) * shortSide;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const tile = Math.max(18, desired * (1 - (attempt / (ATTEMPTS - 1)) * 0.82));
    const gap = Math.max(6, tile * 0.12);
    const heroBox = shortSide * (0.62 - Math.min(1, attempt / 16) * 0.26);
    const qrSize = Math.max(
      Math.min(140, shortSide * 0.34),
      attempt < 18 ? qrPreferred : qrPreferred * (1 - (attempt - 17) * 0.045),
    );
    const center = input.hero
      ? heroRect(stageWidth, stageHeight, input.hero, heroBox)
      : squareRect(stageWidth, stageHeight, qrSize);
    const placed = placeTiles({
      center,
      tile,
      gap,
      count,
      stageWidth,
      stageHeight,
      margin,
    });
    if (!placed) continue;

    const tiles = input.photos.map((photo, index) => ({
      id: photo.id,
      rect: roundRect(placed[index]),
    }));
    const roundedCenter = roundRect(center);
    if (
      tiles.every(
        (tileRect) =>
          inside(tileRect.rect, stageWidth, stageHeight) &&
          separated(tileRect.rect, roundedCenter),
      ) &&
      noOverlap(tiles.map((tileRect) => tileRect.rect))
    ) {
      return {
        stageWidth,
        stageHeight,
        center: { ...roundedCenter, kind: input.hero ? "hero" : "qr" },
        tiles,
      };
    }
  }

  const center = input.hero
    ? heroRect(stageWidth, stageHeight, input.hero, shortSide * 0.36)
    : squareRect(stageWidth, stageHeight, Math.min(qrPreferred, shortSide * 0.28));
  return {
    stageWidth,
    stageHeight,
    center: { ...roundRect(center), kind: input.hero ? "hero" : "qr" },
    tiles: fallbackTiles(input.photos, roundRect(center), stageWidth, stageHeight, margin),
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

function placeTiles(input: {
  center: Rect;
  tile: number;
  gap: number;
  count: number;
  stageWidth: number;
  stageHeight: number;
  margin: number;
}): Rect[] | null {
  const { center, tile, gap, count, stageWidth, stageHeight, margin } = input;
  const cx = center.left + center.width / 2;
  const cy = center.top + center.height / 2;
  const points: { x: number; y: number }[] = [];
  let remaining = count;

  for (let ring = 0; ring < 10 && remaining > 0; ring += 1) {
    const hx = center.width / 2 + gap + tile / 2 + ring * (tile + gap);
    const hy = center.height / 2 + gap + tile / 2 + ring * (tile + gap);
    if (
      cx - hx - tile / 2 < margin ||
      cy - hy - tile / 2 < margin ||
      cx + hx + tile / 2 > stageWidth - margin ||
      cy + hy + tile / 2 > stageHeight - margin
    ) {
      return null;
    }

    const caps = [
      slotsOnSide(hx * 2, tile, gap),
      slotsOnSide(hy * 2, tile, gap),
      slotsOnSide(hx * 2, tile, gap),
      slotsOnSide(hy * 2, tile, gap),
    ];
    const total = caps.reduce((sum, value) => sum + value, 0);
    if (total === 0) continue;

    const take = Math.min(total, remaining);
    const counts = take === total ? caps : distribute(take, caps);
    points.push(...sidePoints(cx, cy, hx, hy, counts, tile, gap));
    remaining -= take;
  }

  if (remaining > 0 || points.length !== count) return null;
  return points.map((point) => ({
    left: point.x - tile / 2,
    top: point.y - tile / 2,
    width: tile,
    height: tile,
  }));
}

function slotsOnSide(side: number, tile: number, gap: number): number {
  const inset = cornerInset(tile, gap);
  const usable = side - inset * 2;
  if (usable < 0) return 0;
  return Math.floor(usable / (tile + gap)) + 1;
}

function cornerInset(tile: number, gap: number): number {
  // Centers on adjacent sides must stay at least a full tile apart on both axes,
  // otherwise the corner squares overlap even when the diagonal looks clear.
  return tile + gap + 2;
}

function distribute(count: number, caps: number[]): number[] {
  const total = caps.reduce((sum, value) => sum + value, 0);
  const raw = caps.map((cap) => (total === 0 ? 0 : (cap / total) * count));
  const counts = raw.map((value, index) => Math.min(caps[index], Math.floor(value)));
  let used = counts.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const entry of order) {
    if (used >= count) break;
    if (counts[entry.index] < caps[entry.index]) {
      counts[entry.index] += 1;
      used += 1;
    }
  }

  while (used < count) {
    const index = counts.findIndex((value, slot) => value < caps[slot]);
    if (index === -1) break;
    counts[index] += 1;
    used += 1;
  }

  return counts;
}

function sidePoints(
  cx: number,
  cy: number,
  hx: number,
  hy: number,
  counts: number[],
  tile: number,
  gap: number,
) {
  const top = centersAlong(hx * 2, counts[0], tile, gap).map((distance) => ({
    x: cx - hx + distance,
    y: cy - hy,
  }));
  const right = centersAlong(hy * 2, counts[1], tile, gap).map((distance) => ({
    x: cx + hx,
    y: cy - hy + distance,
  }));
  const bottom = centersAlong(hx * 2, counts[2], tile, gap).map((distance) => ({
    x: cx + hx - distance,
    y: cy + hy,
  }));
  const left = centersAlong(hy * 2, counts[3], tile, gap).map((distance) => ({
    x: cx - hx,
    y: cy + hy - distance,
  }));
  return [...top, ...right, ...bottom, ...left];
}

function centersAlong(side: number, count: number, tile: number, gap: number): number[] {
  if (count <= 0) return [];
  const inset = cornerInset(tile, gap);
  const start = inset;
  const end = side - inset;
  if (count === 1) return [(start + end) / 2];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + index * step);
}

function heroRect(stageWidth: number, stageHeight: number, hero: PhotoBox, box: number): Rect {
  const maxW = Math.min(box, stageWidth * 0.9);
  const maxH = Math.min(box, stageHeight * 0.9);
  const aspect = hero.width > 0 && hero.height > 0 ? hero.width / hero.height : 1;
  let width = maxW;
  let height = width / aspect;
  if (height > maxH) {
    height = maxH;
    width = height * aspect;
  }
  return {
    left: (stageWidth - width) / 2,
    top: (stageHeight - height) / 2,
    width,
    height,
  };
}

function squareRect(stageWidth: number, stageHeight: number, size: number): Rect {
  const side = Math.min(size, stageWidth * 0.8, stageHeight * 0.8);
  return {
    left: (stageWidth - side) / 2,
    top: (stageHeight - side) / 2,
    width: side,
    height: side,
  };
}

function fallbackTiles(
  photos: PhotoBox[],
  center: Rect,
  stageWidth: number,
  stageHeight: number,
  margin: number,
): PlacedTile[] {
  const tile = 22;
  const gap = 6;
  const placed = placeTiles({
    center,
    tile,
    gap,
    count: photos.length,
    stageWidth,
    stageHeight,
    margin: Math.min(margin, 4),
  });
  if (!placed) {
    return photos.map((photo, index) => ({
      id: photo.id,
      rect: {
        left: margin,
        top: margin + index * (tile + gap),
        width: tile,
        height: tile,
      },
    }));
  }
  return photos.map((photo, index) => ({ id: photo.id, rect: roundRect(placed[index]) }));
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

function inside(rect: Rect, stageWidth: number, stageHeight: number): boolean {
  return (
    rect.left >= -1 &&
    rect.top >= -1 &&
    rect.left + rect.width <= stageWidth + 1 &&
    rect.top + rect.height <= stageHeight + 1
  );
}

function separated(tile: Rect, center: Rect): boolean {
  const dx = Math.max(center.left - (tile.left + tile.width), tile.left - (center.left + center.width));
  const dy = Math.max(center.top - (tile.top + tile.height), tile.top - (center.top + center.height));
  if (dx < 0 && dy < 0) return false;
  return true;
}

function noOverlap(rects: Rect[]): boolean {
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const x = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
      const y = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
      if (x > 1 && y > 1) return false;
    }
  }
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
