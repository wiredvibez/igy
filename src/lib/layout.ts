import type { PublicPhoto, Rect } from "@/lib/types";

export type PlacedTile = {
  id: string;
  rect: Rect;
};

export type StageLayout = {
  stageWidth: number;
  stageHeight: number;
  // A center image is never cropped: draw it with `containRect`. Its cell has the image's
  // own shape (contain only absorbs rounding), except on very small boards, where it may
  // be letterboxed with white bands.
  center: Rect & { kind: "qr" | "hero" };
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

/**
 * Tiles the whole stage edge to edge in justified rows. Each photo's width in its row
 * follows its own aspect ratio, so portraits get tall cells and landscapes wide ones,
 * and a row is scaled (and its photos cover-cropped) only as much as needed to meet
 * the stage edges. The row count and the split of photos into rows are chosen to
 * minimise that crop.
 *
 * The QR is one item in the flow, placed near the middle: alone it fills the screen,
 * then splits it with the first photo, then sits between two, and so on. A center
 * image is never cropped: it is a block of its own exact shape, centered on the stage
 * taking about a fifth to half of the screen, with the photos fitted around it.
 */
export function layoutBoard(input: {
  stageWidth: number;
  stageHeight: number;
  photos: PhotoBox[];
  hero: PhotoBox | null;
  // Pins the center image to this width (the square export uses half the width).
  heroWidth?: number;
}): StageLayout {
  const stageWidth = Math.max(1, Math.round(input.stageWidth));
  const stageHeight = Math.max(1, Math.round(input.stageHeight));
  const kind = input.hero ? "hero" : "qr";
  const full: Rect = { left: 0, top: 0, width: stageWidth, height: stageHeight };

  if (input.photos.length === 0) {
    if (input.hero && input.heroWidth) {
      const pinned = containRect(
        { left: 0, top: 0, width: Math.min(stageWidth, input.heroWidth), height: stageHeight },
        photoAspect(input.hero),
      );
      const center = { ...pinned, left: Math.round((stageWidth - pinned.width) / 2) };
      return { stageWidth, stageHeight, center: { ...center, kind }, tiles: [] };
    }
    return { stageWidth, stageHeight, center: { ...full, kind }, tiles: [] };
  }

  // Photos are laid out by a fixed pseudo-random key rather than upload time, so a new
  // photo lands somewhere random and only the photos after it shift, not always the
  // bottom-right corner. The key comes from the id, so every screen and the export agree.
  const photos = [...input.photos].sort((a, b) => scatterKey(a.id) - scatterKey(b.id));
  const aspects = photos.map(photoAspect);
  let best: Candidate;
  if (input.hero) {
    const heroAspect = photoAspect(input.hero);
    best =
      (aspects.length >= 2
        ? (heroLayout(stageWidth, stageHeight, aspects, heroAspect, false, input.heroWidth) ??
          // Nothing within the size limits: keep it centered anyway.
          heroLayout(stageWidth, stageHeight, aspects, heroAspect, true, input.heroWidth))
        : null) ?? besideLayout(stageWidth, stageHeight, aspects, heroAspect, input.heroWidth);
  } else {
    best = flowLayout(stageWidth, stageHeight, aspects, 1);
  }

  return {
    stageWidth,
    stageHeight,
    center: { ...best.center, kind },
    tiles: photos.map((photo, index) => ({ id: photo.id, rect: best.tiles[index] })),
  };
}

/** FNV-1a over the id: a stable, evenly spread number per photo. */
function scatterKey(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
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

/**
 * The share of the screen the center image aims for: half on a small board, easing to
 * just over a fifth from about thirty photos up, so it always dominates the collage.
 */
function heroShare(count: number): number {
  return Math.min(0.5, Math.max(0.22, 9 / (count + 9)));
}
const HERO_SIZE_WEIGHT = 0.5;
const MIN_SIDE = 24;

/**
 * The thinnest a photo cell may be: below this a photo is a sliver nobody can see. It is
 * a share of the screen, but never more than a third of a typical cell on a full board.
 */
function minTile(stageWidth: number, stageHeight: number, count: number): number {
  const typical = Math.sqrt((stageWidth * stageHeight) / (count + HERO_WEIGHT));
  return Math.max(12, Math.min(0.08 * Math.min(stageWidth, stageHeight), typical / 3));
}

/** Grows steeply as the thinnest photo drops below the floor, without a hard cliff. */
function thinPenalty(rects: Rect[], floorTile: number): number {
  const thinnest = rects.reduce((least, rect) => Math.min(least, rect.width, rect.height), Infinity);
  if (thinnest >= floorTile) return 0;
  const log = Math.log(floorTile / Math.max(1, thinnest));
  return 2 * log * log;
}

function heroLayout(
  stageWidth: number,
  stageHeight: number,
  aspects: number[],
  heroAspect: number,
  relaxed = false,
  fixedWidth?: number,
): Candidate | null {
  const count = aspects.length;
  const targetArea = fixedWidth
    ? (fixedWidth * fixedWidth) / heroAspect
    : heroShare(count) * stageWidth * stageHeight;
  const sizeWeight = HERO_SIZE_WEIGHT;
  // It may shrink somewhat on a small board, but stays well above the photos and never
  // balloons past the target.
  const sizeRange = count >= 8 ? [Math.log(1 / 1.6), Math.log(1.6)] : [Math.log(1 / 1.8), Math.log(1.3)];
  const floorTile = minTile(stageWidth, stageHeight, count);
  let best: Candidate | null = null;
  let bestIsThin = false;

  const consider = (center: Rect, slots: Slot[]) => {
    const size = Math.log((center.width * center.height) / targetArea);
    // Far from the target size: not worth laying out.
    if (!relaxed && (size < sizeRange[0] || size > sizeRange[1])) return;
    // A cell taller or wider than the image leaves white bands beside it.
    const shown = containRect(center, heroAspect);
    const white = 1 - (shown.width * shown.height) / (center.width * center.height);
    const floor = sizeWeight * size * size + 4 * white;
    // The photos can only add cost, so a center this far off can't win.
    if (best && floor >= best.score) return;
    const result = arrange(aspects, slots, relaxed);
    if (!result) return;
    const thin = thinPenalty(result.rects, floorTile);
    const score = floor + result.cost / count + thin;
    if (!best || score < best.score - 1e-9) {
      best = { score, center, tiles: result.rects };
      bestIsThin = thin > 0;
    }
  };

  const edgeOptions = (bandTop: number, rowHeight: number) => {
    if (bandTop <= 0) return [0];
    const nearest = Math.max(1, Math.round(bandTop / rowHeight));
    // One row is always an option, so a handful of photos can still frame a small center.
    return [...new Set([1, nearest - 1, nearest, nearest + 1])].filter((value) => value >= 1);
  };

  // Heights for the center image: about two rows of a justified board, and around the
  // height that hits the target area at its own shape. Its width always follows its shape.
  const ideal = Math.sqrt(targetArea / heroAspect);
  const heights = new Set<number>();
  if (fixedWidth) {
    heights.add(Math.round(fixedWidth / heroAspect));
  } else {
    // Small boards get a couple of extra (shorter) row heights to choose from.
    const maxRows = rowCounts(stageWidth, stageHeight, count + HERO_WEIGHT).length + (count < 10 ? 2 : 0);
    for (let rows = 2; rows <= maxRows; rows += 0.5) heights.add(Math.round((2 * stageHeight) / rows));
    for (const factor of [0.8, 0.9, 1, 1.1, 1.25]) heights.add(Math.round(ideal * factor));
  }
  // Most promising first, so the early cut-off in `consider` skips more of the rest.
  const ordered = [...heights]
    .filter((height) => height >= 2 && height <= stageHeight)
    .sort((a, b) => Math.abs(Math.log(a / ideal)) - Math.abs(Math.log(b / ideal)));

  const meanAspect = aspects.reduce((sum, aspect) => sum + aspect, 0) / count;

  for (const height of ordered) {
    const bandTop = Math.round((stageHeight - height) / 2);
    const bandBottom = stageHeight - bandTop;
    const bandHeight = bandBottom - bandTop;
    const heroWidth = Math.round(heroAspect * bandHeight);
    const left = Math.floor((stageWidth - heroWidth) / 2);
    const right = stageWidth - heroWidth - left;
    // Side columns narrower than a quarter of the center's height only hold slivers.
    if (left < (relaxed ? MIN_SIDE : Math.max(MIN_SIDE, bandHeight / 4))) continue;
    const center = { left, top: bandTop, width: heroWidth, height: bandHeight };

    // Pinned width with only a thin strip left above and below (a tall image in the
    // export): give the center image the full-height column instead, with small white
    // bands, rather than fill those strips with slivers.
    if (fixedWidth && bandTop > 0 && bandTop < 2 * floorTile) {
      const column = { left, top: 0, width: heroWidth, height: stageHeight };
      const fullRows = Math.max(1, Math.round(stageHeight / Math.max(1, bandHeight / 2)));
      for (let sideRows = 1; sideRows <= Math.min(12, fullRows + 4); sideRows += 1) {
        consider(column, [
          ...stackRows(0, 0, left, stageHeight, sideRows, 1),
          ...stackRows(stageWidth - right, 0, right, stageHeight, sideRows, 2),
        ]);
      }
    }

    // Photo rows half the center's height (so it is two rows tall), or the height the
    // photos would naturally take on the space left over, which suits a big center.
    const natural = Math.sqrt((stageWidth * stageHeight - heroWidth * bandHeight) / count / meanAspect);
    const rowHeights = [...new Set([bandHeight / 2, natural].map((value) => Math.round(value)))].filter(
      (value) => value >= 1,
    );
    for (const rowHeight of rowHeights) {
      const besideRows = Math.max(2, Math.round(bandHeight / rowHeight));
      for (const edgeRows of edgeOptions(bandTop, rowHeight)) {
        // A frame: full-width rows above and below, rows beside the center image.
        consider(center, [
          ...stackRows(0, 0, stageWidth, bandTop, edgeRows, 0),
          ...stackRows(0, bandTop, left, bandHeight, besideRows, 1),
          ...stackRows(stageWidth - right, bandTop, right, bandHeight, besideRows, 2),
          ...stackRows(0, bandBottom, stageWidth, stageHeight - bandBottom, edgeRows, 3),
        ]);
        // Columns: full-height columns either side, rows above and below the center only.
        const fullRows = Math.max(1, Math.round(stageHeight / rowHeight));
        for (let sideRows = Math.max(1, fullRows - 2); sideRows <= fullRows + 1; sideRows += 1) {
          consider(center, [
            ...stackRows(0, 0, left, stageHeight, sideRows, 1),
            ...stackRows(left, 0, heroWidth, bandTop, edgeRows, 0),
            ...stackRows(left, bandBottom, heroWidth, stageHeight - bandBottom, edgeRows, 3),
            ...stackRows(stageWidth - right, 0, right, stageHeight, sideRows, 2),
          ]);
        }
      }
    }
  }

  // Rows only: the center image spans the full width, photos above and below it.
  const fullHeight = Math.round(stageWidth / heroAspect);
  const bandTop = Math.floor((stageHeight - fullHeight) / 2);
  const bandBottom = bandTop + fullHeight;
  if (!fixedWidth && bandTop >= (relaxed ? 1 : MIN_SIDE)) {
    for (const edgeRows of edgeOptions(bandTop, fullHeight / 2)) {
      consider({ left: 0, top: bandTop, width: stageWidth, height: fullHeight }, [
        ...stackRows(0, 0, stageWidth, bandTop, edgeRows, 0),
        ...stackRows(0, bandBottom, stageWidth, stageHeight - bandBottom, edgeRows, 3),
      ]);
    }
  }
  // When nothing fits without slivers, e.g. two or three photos and a center image the
  // shape of the screen:
  // it can't be both centered and uncropped with photos all round, so it takes the
  // middle column, shown whole with white bands, and the photos fill the side columns.
  if ((relaxed && !best) || (best && bestIsThin && count <= 3)) {
    for (const share of fixedWidth ? [fixedWidth / stageWidth] : [0.5, 0.6, 0.7]) {
      const left = Math.floor((stageWidth * (1 - share)) / 2);
      const right = stageWidth - Math.round(stageWidth * share) - left;
      if (left < MIN_SIDE || right < MIN_SIDE) continue;
      const center = { left, top: 0, width: stageWidth - left - right, height: stageHeight };
      const shown = containRect(center, heroAspect);
      const white = 1 - (shown.width * shown.height) / (center.width * center.height);
      for (let sideRows = 1; sideRows <= Math.min(12, Math.ceil(count / 2)); sideRows += 1) {
        const result = arrange(
          aspects,
          [
            ...stackRows(0, 0, left, stageHeight, sideRows, 1),
            ...stackRows(stageWidth - right, 0, right, stageHeight, sideRows, 2),
          ],
          true,
        );
        if (!result) continue;
        // White bands count against it, so an exact fit wins whenever there is one.
        const score = result.cost / (count + HERO_WEIGHT) + 4 * white + thinPenalty(result.rects, floorTile);
        if (!best || score < best.score - 1e-9) best = { score, center, tiles: result.rects };
      }
    }
  }

  return best;
}

/**
 * The center image beside (or above) the photos, used when there are too few photos to
 * surround it. It keeps its exact shape where it can; if its shape is too close to the
 * stage's to leave room, it gets most of the stage and is letterboxed in white.
 */
function besideLayout(
  stageWidth: number,
  stageHeight: number,
  aspects: number[],
  heroAspect: number,
  fixedWidth?: number,
): Candidate {
  const floorTile = minTile(stageWidth, stageHeight, aspects.length);
  const options: { center: Rect; region: Rect }[] = [];
  if (fixedWidth && fixedWidth < stageWidth) {
    // Pinned width (the export): the center image's column, the photos beside it.
    options.push({
      center: { left: 0, top: 0, width: fixedWidth, height: stageHeight },
      region: { left: fixedWidth, top: 0, width: stageWidth - fixedWidth, height: stageHeight },
    });
  }
  const heroWidth = Math.round(heroAspect * stageHeight);
  if (!fixedWidth && heroWidth <= stageWidth - floorTile) {
    options.push({
      center: { left: 0, top: 0, width: heroWidth, height: stageHeight },
      region: { left: heroWidth, top: 0, width: stageWidth - heroWidth, height: stageHeight },
    });
  }
  const heroHeight = Math.round(stageWidth / heroAspect);
  if (!fixedWidth && heroHeight <= stageHeight - floorTile) {
    options.push({
      center: { left: 0, top: 0, width: stageWidth, height: heroHeight },
      region: { left: 0, top: heroHeight, width: stageWidth, height: stageHeight - heroHeight },
    });
  }
  // Too close to the stage's shape to leave a usable strip: most of the stage, letterboxed.
  const width = Math.round(stageWidth * 0.7);
  if (!fixedWidth) options.push({
    center: { left: 0, top: 0, width, height: stageHeight },
    region: { left: width, top: 0, width: stageWidth - width, height: stageHeight },
  });

  let best: Candidate | null = null;
  for (const { center, region } of options) {
    if (region.width < 1 || region.height < 1) continue;
    for (let rows = 1; rows <= Math.min(12, aspects.length); rows += 1) {
      const result = arrange(aspects, stackRows(region.left, region.top, region.width, region.height, rows, 0), true);
      if (!result) continue;
      const score = result.cost / aspects.length;
      if (!best || score < best.score - 1e-9) best = { score, center, tiles: result.rects };
    }
  }
  // A stage only a few pixels across: the plain flow always fits.
  return best ?? flowLayout(stageWidth, stageHeight, aspects, heroAspect);
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
