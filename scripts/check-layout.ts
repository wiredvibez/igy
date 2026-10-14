import { inspectImage } from "../src/lib/image-bytes";
import { expandedRect, layoutBoard } from "../src/lib/layout";
import type { Rect } from "../src/lib/types";

const stages = [
  [1920, 1080],
  [1080, 1920],
  [1280, 800],
  [1024, 768],
  [2560, 1440],
];
const counts = [0, 1, 2, 3, 5, 12, 40, 80, 99, 100];
const heroes = [
  null,
  { id: "hero", width: 4000, height: 3000 },
  { id: "hero", width: 1080, height: 1920 },
  { id: "hero", width: 3000, height: 1000 },
];

let failures = 0;

for (const [stageWidth, stageHeight] of stages) {
  for (const count of counts) {
    for (const hero of heroes) {
      const photos = Array.from({ length: count }, (_, index) => ({
        id: `p-${index}`,
        width: 1200 + (index % 5) * 180,
        height: 800 + (index % 3) * 220,
      }));
      const layout = layoutBoard({ stageWidth, stageHeight, photos, hero });
      const label = `${stageWidth}x${stageHeight} n=${count} hero=${hero ? hero.width + "x" + hero.height : "qr"}`;
      if (layout.tiles.length !== count) fail(label, `placed ${layout.tiles.length}`);
      const area = [layout.center, ...layout.tiles.map((tile) => tile.rect)].reduce(
        (sum, rect) => sum + rect.width * rect.height,
        0,
      );
      if (area !== stageWidth * stageHeight) fail(label, `covers ${area} of ${stageWidth * stageHeight}`);
      if (hero && count >= 2) {
        const dx = layout.center.left + layout.center.width / 2 - stageWidth / 2;
        const dy = layout.center.top + layout.center.height / 2 - stageHeight / 2;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) fail(label, "center image not centered");
      }
      for (const rect of [layout.center, ...layout.tiles.map((tile) => tile.rect)]) {
        if (rect.width <= 0 || rect.height <= 0) fail(label, "empty cell");
      }
      for (const tile of layout.tiles) {
        if (!inside(tile.rect, stageWidth, stageHeight)) fail(label, "tile outside");
        if (overlaps(tile.rect, layout.center)) fail(label, "tile hits center");
      }
      for (let i = 0; i < layout.tiles.length; i += 1) {
        for (let j = i + 1; j < layout.tiles.length; j += 1) {
          if (overlaps(layout.tiles[i].rect, layout.tiles[j].rect)) fail(label, "tiles overlap");
        }
      }
    }
  }
}

// Cells follow each photo's shape. With square photos the QR therefore splits the stage
// 50:50, then into thirds with the QR in the middle.
const two = layoutBoard({ stageWidth: 1920, stageHeight: 1080, photos: [{ id: "a", width: 1, height: 1 }], hero: null });
if (two.center.width !== 960 || two.tiles[0].rect.width !== 960 || two.tiles[0].rect.height !== 1080) fail("two", "not 50:50");
const three = layoutBoard({
  stageWidth: 1920,
  stageHeight: 1080,
  photos: [{ id: "a", width: 1, height: 1 }, { id: "b", width: 1, height: 1 }],
  hero: null,
});
if (three.center.width !== 640 || three.center.left !== 640) fail("three", "not thirds with the QR in the middle");
// With enough photos the center image sits dead center at about four times a photo.
const mixed = Array.from({ length: 30 }, (_, index) => ({
  id: `m-${index}`,
  width: index % 3 === 0 ? 900 : 1600,
  height: index % 3 === 0 ? 1600 : 1000,
}));
const centered = layoutBoard({
  stageWidth: 1920,
  stageHeight: 1080,
  photos: mixed,
  hero: { id: "hero", width: 1600, height: 1000 },
});
const middleX = centered.center.left + centered.center.width / 2;
const middleY = centered.center.top + centered.center.height / 2;
if (Math.abs(middleX - 960) > 1 || Math.abs(middleY - 540) > 1) fail("hero", "not centered");
const typical = centered.tiles.map((tile) => tile.rect.width * tile.rect.height).sort((a, b) => a - b)[15];
const ratio = (centered.center.width * centered.center.height) / typical;
if (ratio < 2.5 || ratio > 6.5) fail("hero", `is ${ratio.toFixed(1)}x a photo`);
// Portraits stay portrait and landscapes stay landscape.
for (const [index, tile] of centered.tiles.entries()) {
  const portrait = mixed[index].height > mixed[index].width;
  if (portrait !== tile.rect.height > tile.rect.width) fail("orientation", `photo ${index} turned sideways`);
}

// A wider photo gets a wider cell beside the QR.
const wideFirst = layoutBoard({
  stageWidth: 1920,
  stageHeight: 1080,
  photos: [{ id: "a", width: 1600, height: 900 }],
  hero: null,
});
if (!(wideFirst.tiles[0].rect.width > wideFirst.center.width)) fail("wide", "landscape photo is not wider than the QR");

const one = layoutBoard({ stageWidth: 1920, stageHeight: 1080, photos: [], hero: null });
if (one.center.width !== 1920 || one.center.height !== 1080) fail("one", "QR is not full page");

const wide = expandedRect(1920, 1080, 16 / 9);
if (wide.width > 1920 * 0.921 || wide.height > 1080 * 0.921) fail("expand", "overflows");
const portrait = expandedRect(1080, 1920, 9 / 16);
if (portrait.width > 1080 * 0.921 || portrait.height > 1920 * 0.921) fail("expand portrait", "overflows");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const inspected = inspectImage(png);
if (!inspected || inspected.type !== "image/png" || inspected.width !== 1 || inspected.height !== 1) {
  fail("png", "header not read");
}
if (inspectImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))) fail("svg", "accepted");

if (failures > 0) {
  console.error(`${failures} layout checks failed`);
  process.exit(1);
}
console.log("layout checks passed");

function fail(label: string, reason: string) {
  failures += 1;
  console.error(`${label}: ${reason}`);
}

function inside(rect: Rect, width: number, height: number) {
  return rect.left >= -1 && rect.top >= -1 && rect.left + rect.width <= width + 1 && rect.top + rect.height <= height + 1;
}

function overlaps(a: Rect, b: Rect) {
  const x = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const y = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return x > 1 && y > 1;
}
