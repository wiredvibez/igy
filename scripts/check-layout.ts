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
const counts = [0, 1, 2, 5, 12, 40, 80];
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
      if (hero && Math.abs(layout.center.width / layout.center.height - hero.width / hero.height) > 0.04) {
        fail(label, "hero aspect drifted");
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
