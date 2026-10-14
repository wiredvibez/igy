import { BOARD_BG } from "@/lib/constants";
import { containRect, coverSource, exportStage, layoutBoard, photoAspect } from "@/lib/layout";
import { QR_QUIET, qrDrawSize, qrGrid } from "@/lib/qr";
import type { PublicSession, Rect } from "@/lib/types";

export async function renderBoardPng(session: PublicSession, joinUrl: string): Promise<Blob> {
  const stage = exportStage(session.viewport);
  const long = Math.max(stage.width, stage.height);
  const cap = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 2048 : 3840;
  const target = Math.min(cap, Math.max(long, Math.min(long * 2, cap)));
  return drawBoard(session, joinUrl, stage.width, stage.height, target / long, 0);
}

export async function renderBoardZip(session: PublicSession, joinUrl: string): Promise<Blob> {
  const [{ default: JSZip }, png] = await Promise.all([import("jszip"), renderBoardPng(session, joinUrl)]);
  const zip = new JSZip();
  zip.file("presenter.png", png, { compression: "STORE" });
  if (session.hero) {
    const file = await fetchAsset(session.hero.id, "center");
    zip.file(file.name, file.bytes, { compression: "STORE" });
  }
  for (const [index, photo] of session.photos.entries()) {
    const file = await fetchAsset(photo.id, `photos/${String(index + 1).padStart(2, "0")}`);
    zip.file(file.name, file.bytes, { compression: "STORE" });
  }
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

async function drawBoard(
  session: PublicSession,
  joinUrl: string,
  stageWidth: number,
  stageHeight: number,
  scale: number,
  attempt: number,
): Promise<Blob> {
  const layout = layoutBoard({
    stageWidth,
    stageHeight,
    photos: session.photos,
    hero: session.hero,
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(stageWidth * scale));
  canvas.height = Math.max(1, Math.round(stageHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("לא הצלחנו ליצור את התמונה.");

  context.fillStyle = BOARD_BG;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const bitmaps = new Map<string, ImageBitmap>();

  try {
    await Promise.all(
      [...session.photos.map((photo) => photo.id), ...(session.hero ? [session.hero.id] : [])].map(
        async (id) => {
          bitmaps.set(id, await loadBitmap(`/api/media/${id}`));
        },
      ),
    );

    for (const tile of layout.tiles) {
      const bitmap = bitmaps.get(tile.id);
      if (!bitmap) throw new Error("אחת התמונות חסרה.");
      drawCover(context, bitmap, scaleRect(tile.rect, scale), 0);
    }

    if (layout.center.kind === "hero" && session.hero) {
      const bitmap = bitmaps.get(session.hero.id);
      if (!bitmap) throw new Error("התמונה המרכזית חסרה.");
      drawImageInRect(context, bitmap, scaleRect(containRect(layout.center, photoAspect(session.hero)), scale), 0);
    } else if (joinUrl) {
      drawQr(context, joinUrl, scaleRect(layout.center, scale));
    }
  } finally {
    for (const bitmap of bitmaps.values()) bitmap.close();
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/png"));
  if (!blob) {
    if (attempt >= 3) throw new Error("לא הצלחנו ליצור את התמונה.");
    return drawBoard(session, joinUrl, stageWidth, stageHeight, scale * 0.75, attempt + 1);
  }
  return blob;
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error("אחת התמונות חסרה.");
  return createImageBitmap(await response.blob());
}

function drawCover(
  context: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  rect: Rect,
  radius: number,
) {
  const crop = coverSource(bitmap.width, bitmap.height, rect.width, rect.height);
  clip(context, rect, radius, () => {
    context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, rect.left, rect.top, rect.width, rect.height);
  });
}

function drawImageInRect(
  context: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  rect: Rect,
  radius: number,
) {
  clip(context, rect, radius, () => {
    context.drawImage(bitmap, rect.left, rect.top, rect.width, rect.height);
  });
}

function drawQr(context: CanvasRenderingContext2D, url: string, rect: Rect) {
  clip(context, rect, 0, () => {
    context.fillStyle = "#ffffff";
    context.fillRect(rect.left, rect.top, rect.width, rect.height);
    const grid = qrGrid(url);
    const { moduleSize, pixelSize } = qrDrawSize(Math.min(rect.width, rect.height) * 0.94, grid.size);
    const originX = Math.round(rect.left + (rect.width - pixelSize) / 2);
    const originY = Math.round(rect.top + (rect.height - pixelSize) / 2);
    context.fillStyle = "#000000";
    for (let row = 0; row < grid.size; row += 1) {
      for (let col = 0; col < grid.size; col += 1) {
        if (!grid.modules[row * grid.size + col]) continue;
        context.fillRect(
          originX + (col + QR_QUIET) * moduleSize,
          originY + (row + QR_QUIET) * moduleSize,
          moduleSize,
          moduleSize,
        );
      }
    }
  });
}

function clip(
  context: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
  draw: () => void,
) {
  context.save();
  context.beginPath();
  context.roundRect(
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    Math.min(radius, rect.width / 2, rect.height / 2),
  );
  context.clip();
  draw();
  context.restore();
}

function scaleRect(rect: Rect, scale: number): Rect {
  const left = Math.round(rect.left * scale);
  const top = Math.round(rect.top * scale);
  const right = Math.round((rect.left + rect.width) * scale);
  const bottom = Math.round((rect.top + rect.height) * scale);
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

async function fetchAsset(id: string, stem: string): Promise<{ name: string; bytes: ArrayBuffer }> {
  const response = await fetch(`/api/media/${id}`, { cache: "force-cache" });
  if (!response.ok) throw new Error("אחת התמונות חסרה.");
  const extension = response.headers.get("content-type") === "image/png" ? "png" : "jpg";
  return { name: `${stem}.${extension}`, bytes: await response.arrayBuffer() };
}
