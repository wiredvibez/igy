import { EXPORT_FALLBACK, VIEWPORT_STALE_MS } from "@/lib/constants";
import type { PublicPhoto, Rect, ViewportState } from "@/lib/types";

export type PlacedTile = {
  id: string;
  rect: Rect;
};

export type StageLayout = {
  stageWidth: number;
  stageHeight: number;
  // "contain" only when the center image is alone on the board; otherwise its cell fits it.
  center: Rect & { kind: "qr" | "hero"; fit: "cover" | "contain" };
  tiles: PlacedTile[];
};

type PhotoBox = {
  id: string;
  width: number;
  height: number;
};

// A slot is one row-shaped region that a run of photos fills side by side. Slots in the
// same stack sit on top of each other with a shared width, so their heights can be traded.
type Slot = Rect & { stack: number };

type Candidate = {
  score: number;
  center: Rect;
  tiles: Rect[];
};

const PORTRAIT = 0.9;
const LANDSCAPE = 1.1;
// Stretching a portrait photo wider, or a landscape one narrower, costs this much more,
// so cells keep each photo's orientation.
const ORIENTATION_WEIGHT = 6;
const MAX_HERO_SHARE = 0.8;
// The center image may be cropped to at most this much wider or narrower than itself.
const MAX_HERO_CROP = 1.8;

/**
 * Tiles the whole stage edge to edge in justified rows. Each photo's width in its row
 * follows its own aspect ratio, so portraits get tall cells and landscapes wide ones,
 * and a row is scaled (and its photos cover-cropped) only as much as needed to meet
 * the stage edges. The row count and the split of photos into rows are chosen to
 * minimise that crop.
 *
 * The QR is one item in the flow, placed near the middle: alone it fills the screen,
 * then splits it with the first photo, then sits between two, and so on. A center
 * image is a fixed block two rows tall (four times a photo of the same shape),
 * centered on the stage, with photos in rows above, below and beside it.
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
  const full: Rect = { left: 0, top: 0, width: stageWidth, height: stageHeight };

  if (input.photos.length === 0) {
    return { stageWidth, stageHeight, center: { ...full, kind, fit: input.hero ? "contain" : "cover" }, tiles: [] };
  }

  const aspects = input.photos.map(photoAspect);
  const best =
    (input.hero && input.photos.length >= 2
      ? (heroLayout(stageWidth, stageHeight, aspects, photoAspect(input.hero)) ??
        // Nothing within the size and crop limits: keep it centered anyway.
        heroLayout(stageWidth, stageHeight, aspects, photoAspect(input.hero), true))
      : null) ?? flowLayout(stageWidth, stageHeight, aspects, input.hero ? photoAspect(input.hero) : 1);

  return {
    stageWidth,
    stageHeight,
    center: { ...best.center, kind, fit: "cover" },
    tiles: input.photos.map((photo, index) => ({ id: photo.id, rect: best.tiles[index] })),
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

function flowLayout(stageWidth: number, stageHeight: number, aspects: number[], centerAspect: number): Candidate {
  const count = aspects.length + 1;
  const middle = Math.floor(count / 2);
  const positions = [-2, -1, 0, 1, 2].map((step) => middle + step).filter((index) => index >= 0 && index < count);
  const halfDiagonal = Math.hypot(stageWidth, stageHeight) / 2;
  let best: Candidate | null = null;

  for (const position of positions) {
    const items = [...aspects.slice(0, position), centerAspect, ...aspects.slice(position)];
    for (const rows of rowCounts(stageWidth, stageHeight, count)) {
      const slots = stackRows(0, 0, stageWidth, stageHeight, rows, 0);
      const result = arrange(items, slots);
      if (!result) continue;
      const center = result.rects[position];
      const off = Math.hypot(
        center.left + center.width / 2 - stageWidth / 2,
        center.top + center.height / 2 - stageHeight / 2,
      );
      const score = result.cost / count + 0.03 * (off / halfDiagonal);
      if (!best || score < best.score - 1e-9) {
        best = {
          score,
          center,
          tiles: [...result.rects.slice(0, position), ...result.rects.slice(position + 1)],
        };
      }
    }
  }

  if (best) return best;
  // Every candidate fell outside the row-size limits: one loose row always fits.
  const result = arrange([...aspects.slice(0, middle), centerAspect, ...aspects.slice(middle)], stackRows(0, 0, stageWidth, stageHeight, 1, 0), true)!;
  return {
    score: Infinity,
    center: result.rects[middle],
    tiles: [...result.rects.slice(0, middle), ...result.rects.slice(middle + 1)],
  };
}

const HERO_WEIGHT = 4;
const HERO_SIZE_WEIGHT = 0.5;

function heroLayout(
  stageWidth: number,
  stageHeight: number,
  aspects: number[],
  heroAspect: number,
  relaxed = false,
): Candidate | null {
  const count = aspects.length;
  // Four times the average photo: hero = 4 × (stage − hero) / count.
  const targetArea = (HERO_WEIGHT * stageWidth * stageHeight) / (count + HERO_WEIGHT);
  let best: Candidate | null = null;

  // On a small board an exact 4× center squeezes the few photos into strips, so the
  // target softens until there are about eight photos to frame it.
  const sizeWeight = HERO_SIZE_WEIGHT * Math.min(1, count / 8);
  const sizeLimit = Math.log(count >= 8 ? 1.6 : 3);

  const consider = (center: Rect, slots: Slot[]) => {
    const size = Math.log((center.width * center.height) / targetArea);
    // Cropping the center image costs the same either way; it has no "sideways" to avoid.
    const crop = Math.log(center.width / center.height / heroAspect);
    // Far from four times a photo, or cropped to a very different shape: not worth laying out.
    if (!relaxed && (Math.abs(size) > sizeLimit || Math.abs(crop) > Math.log(MAX_HERO_CROP))) return;
    const floor = (HERO_WEIGHT * crop * crop) / (count + HERO_WEIGHT) + sizeWeight * size * size;
    // The photos can only add cost, so a center this costly can't win.
    if (best && floor >= best.score) return;
    const result = arrange(aspects, slots, relaxed);
    if (!result) return;
    const score = floor + result.cost / (count + HERO_WEIGHT);
    if (!best || score < best.score - 1e-9) best = { score, center, tiles: result.rects };
  };

  // The center image's height is two "rows"; try a range of row heights.
  // Small boards get a couple of extra (shorter) row heights to choose from.
  const maxRows = rowCounts(stageWidth, stageHeight, count + HERO_WEIGHT).length + (count < 10 ? 2 : 0);
  // Most promising first (a center of its own shape at the 4× area), so the early
  // cut-off in `consider` skips more of the rest.
  const ideal = stageHeight / (Math.sqrt(targetArea / heroAspect) / 2);
  const rowOptions: number[] = [];
  for (let rows = 2; rows <= maxRows; rows += 0.5) rowOptions.push(rows);
  rowOptions.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));

  for (const rows of rowOptions) {
    const rowHeight = stageHeight / rows;
    const bandTop = Math.round((stageHeight - 2 * rowHeight) / 2);
    const bandBottom = stageHeight - bandTop;
    const bandHeight = bandBottom - bandTop;
    const nearest = bandTop > 0 ? Math.max(1, Math.round(bandTop / rowHeight)) : 0;
    const edgeOptions = nearest === 0 ? [0] : [nearest - 1, nearest, nearest + 1].filter((value) => value >= 1);

    // Rows only: the center image spans the full width, photos above and below it.
    for (const edgeRows of edgeOptions) {
      if (edgeRows === 0) continue;
      consider({ left: 0, top: bandTop, width: stageWidth, height: bandHeight }, [
        ...stackRows(0, 0, stageWidth, bandTop, edgeRows, 0),
        ...stackRows(0, bandBottom, stageWidth, stageHeight - bandBottom, edgeRows, 3),
      ]);
    }

    // Widths that keep the center image's own shape, and widths that hit the 4× area
    // exactly (cropping it a little), so small boards have a good option too.
    const natural = heroAspect * bandHeight;
    const exact = targetArea / bandHeight;
    const widths = new Set(
      [natural, natural * 0.8, exact * 0.85, exact, exact * 1.2].map((width) =>
        Math.round(Math.min(width, stageWidth * MAX_HERO_SHARE)),
      ),
    );
    for (const heroWidth of widths) {
      const side = Math.round((stageWidth - heroWidth) / 2);
      // Side columns narrower than half a row only hold slivers.
      if (side < (relaxed ? 24 : Math.max(24, rowHeight * 0.5))) continue;
      const center = { left: side, top: bandTop, width: stageWidth - 2 * side, height: bandHeight };

      for (const edgeRows of edgeOptions) {
        // A frame: full-width rows above and below, two rows beside the center image.
        consider(center, [
          ...stackRows(0, 0, stageWidth, bandTop, edgeRows, 0),
          ...stackRows(0, bandTop, side, bandHeight, 2, 1),
          ...stackRows(stageWidth - side, bandTop, side, bandHeight, 2, 2),
          ...stackRows(0, bandBottom, stageWidth, stageHeight - bandBottom, edgeRows, 3),
        ]);
        // Columns: full-height columns either side, rows above and below the center only.
        const fullRows = Math.max(1, Math.round(stageHeight / rowHeight));
        for (let sideRows = Math.max(1, fullRows - 1); sideRows <= fullRows + 1; sideRows += 1) {
          consider(center, [
            ...stackRows(0, 0, side, stageHeight, sideRows, 1),
            ...stackRows(side, 0, center.width, bandTop, edgeRows, 0),
            ...stackRows(side, bandBottom, center.width, stageHeight - bandBottom, edgeRows, 3),
            ...stackRows(stageWidth - side, 0, side, stageHeight, sideRows, 2),
          ]);
        }
      }
    }
  }
  return best;
}

/** Row counts worth trying: up to about twice the count that gives roughly square cells. */
function rowCounts(stageWidth: number, stageHeight: number, items: number): number[] {
  const square = Math.sqrt((items * stageHeight) / stageWidth);
  const max = Math.max(1, Math.min(items, Math.ceil(square * 2) + 2));
  return Array.from({ length: max }, (_, index) => index + 1);
}

function stackRows(left: number, top: number, width: number, height: number, rows: number, stack: number): Slot[] {
  if (rows <= 0 || height <= 0) return [];
  return splitEdges(top, height, Array(rows).fill(1)).map((band) => ({ left, width, stack, ...band }));
}

/** Splits [from, from + length) into integer bands proportional to the weights, with no gaps. */
function splitEdges(from: number, length: number, weights: number[]): { top: number; height: number }[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let acc = 0;
  return weights.map((weight) => {
    const top = Math.round(from + (length * acc) / total);
    acc += weight;
    const bottom = Math.round(from + (length * acc) / total);
    return { top, height: bottom - top };
  });
}

/** The crop a photo pays for a cell of a different shape; turning it sideways costs more. */
function itemCost(aspect: number, cellAspect: number): number {
  const log = Math.log(cellAspect / aspect);
  const against = (aspect < PORTRAIT && log > 0) || (aspect > LANDSCAPE && log < 0);
  return log * log * (1 + (against ? ORIENTATION_WEIGHT : 0));
}

/**
 * Fills the slots with the photos in order and returns their cells. Grouping comes from
 * `groupRows`; each stack then keeps its even row heights or switches to heights that
 * let every row hold its photos at their own shape (a justified gallery), whichever
 * crops less.
 */
function arrange(aspects: number[], slots: Slot[], loose = false): { cost: number; rects: Rect[] } | null {
  const groups = groupRows(aspects, slots, loose);
  if (!groups) return null;

  const sum = [0];
  for (const aspect of aspects) sum.push(sum[sum.length - 1] + aspect);
  const rowAspect = (index: number) => sum[groups[index][1]] - sum[groups[index][0]];

  const placed = slots.map((slot) => ({ ...slot }));
  const stacks = new Map<number, number[]>();
  slots.forEach((slot, index) => stacks.set(slot.stack, [...(stacks.get(slot.stack) ?? []), index]));

  const rowsCost = (indexes: number[], heights: number[]) =>
    indexes.reduce((total, slotIndex, row) => {
      const [start, end] = groups[slotIndex];
      const scale = slots[slotIndex].width / (heights[row] * rowAspect(slotIndex));
      let cost = 0;
      for (let item = start; item < end; item += 1) cost += itemCost(aspects[item], aspects[item] * scale);
      return total + cost;
    }, 0);

  let cost = 0;
  for (const indexes of stacks.values()) {
    const top = slots[indexes[0]].top;
    const last = slots[indexes[indexes.length - 1]];
    const height = last.top + last.height - top;
    const even = indexes.map((index) => slots[index].height);
    const justified = splitEdges(
      top,
      height,
      indexes.map((index) => slots[index].width / rowAspect(index)),
    );
    const evenCost = rowsCost(indexes, even);
    const justifiedCost = justified.every((band) => band.height > 0)
      ? rowsCost(indexes, justified.map((band) => band.height))
      : Infinity;
    if (justifiedCost < evenCost) {
      indexes.forEach((index, row) => Object.assign(placed[index], justified[row]));
      cost += justifiedCost;
    } else {
      cost += evenCost;
    }
  }

  const rects: Rect[] = new Array(aspects.length);
  placed.forEach((box, slotIndex) => {
    const [start, end] = groups[slotIndex];
    const total = rowAspect(slotIndex);
    const right = box.left + box.width;
    for (let index = start; index < end; index += 1) {
      const left = Math.round(box.left + (box.width * (sum[index] - sum[start])) / total);
      const edge =
        index === end - 1 ? right : Math.round(box.left + (box.width * (sum[index + 1] - sum[start])) / total);
      rects[index] = { left, top: box.top, width: edge - left, height: box.height };
    }
  });
  return { cost, rects };
}

/**
 * Splits the photos, in order, into consecutive groups, one non-empty group per slot,
 * minimising the crop at the slots' even heights: a group whose natural width (height ×
 * summed aspects) differs from the slot width is scaled to fit, and each photo pays
 * (ln scale)², more when that turns it sideways.
 */
function groupRows(aspects: number[], slots: Slot[], loose: boolean): [number, number][] | null {
  const count = aspects.length;
  const slotCount = slots.length;
  if (slotCount === 0 || slotCount > count) return null;

  const sum = new Float64Array(count + 1);
  const portrait = new Int32Array(count + 1);
  const landscape = new Int32Array(count + 1);
  aspects.forEach((aspect, index) => {
    sum[index + 1] = sum[index] + aspect;
    portrait[index + 1] = portrait[index] + (aspect < PORTRAIT ? 1 : 0);
    landscape[index + 1] = landscape[index] + (aspect > LANDSCAPE ? 1 : 0);
  });

  const groupCost = (slot: Slot, from: number, to: number) => {
    const scale = slot.width / (slot.height * (sum[to] - sum[from]));
    const log = Math.log(scale);
    const against = scale > 1 ? portrait[to] - portrait[from] : landscape[to] - landscape[from];
    return log * log * (to - from + ORIENTATION_WEIGHT * against);
  };

  // A row far over or under what it naturally holds is never the best answer, so only
  // group sizes near each slot's capacity are tried. That keeps 100 photos fast.
  const mean = sum[count] / count;
  const limits = slots.map((slot) => {
    if (loose) return { min: 1, max: count };
    const capacity = slot.width / (slot.height * mean);
    return { min: Math.max(1, Math.floor(capacity / 3)), max: Math.ceil(capacity * 3) + 1 };
  });

  const width = count + 1;
  const cost = new Float64Array((slotCount + 1) * width).fill(Infinity);
  const from = new Int32Array((slotCount + 1) * width).fill(-1);
  cost[0] = 0;
  for (let slot = 1; slot <= slotCount; slot += 1) {
    const last = count - (slotCount - slot);
    const { min, max } = limits[slot - 1];
    for (let end = slot; end <= last; end += 1) {
      let bestCost = Infinity;
      let bestStart = -1;
      for (let start = Math.max(slot - 1, end - max); start <= end - min; start += 1) {
        const before = cost[(slot - 1) * width + start];
        if (before === Infinity) continue;
        const total = before + groupCost(slots[slot - 1], start, end);
        if (total < bestCost) {
          bestCost = total;
          bestStart = start;
        }
      }
      cost[slot * width + end] = bestCost;
      from[slot * width + end] = bestStart;
    }
  }
  if (!Number.isFinite(cost[slotCount * width + count])) return null;

  const groups: [number, number][] = new Array(slotCount);
  let end = count;
  for (let slot = slotCount; slot >= 1; slot -= 1) {
    const start = from[slot * width + end];
    groups[slot - 1] = [start, end];
    end = start;
  }
  return groups;
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
