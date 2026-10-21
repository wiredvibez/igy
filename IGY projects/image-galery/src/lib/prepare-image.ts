import { MAX_BYTES, MAX_EDGE } from "@/lib/constants";

export class PrepareError extends Error {
  constructor(
    public code: "large" | "type",
    message: string,
  ) {
    super(message);
  }
}

export async function prepareImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.size > MAX_BYTES) {
    throw new PrepareError("large", "התמונה גדולה מ־10MB.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PrepareError("type", "לא הצלחנו לקרוא את התמונה הזאת.");
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PrepareError("type", "לא הצלחנו לקרוא את התמונה הזאת.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await encodeUnder(canvas, MAX_BYTES);
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

async function encodeUnder(source: HTMLCanvasElement, limit: number): Promise<Blob> {
  let canvas = source;
  let quality = 0.9;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const blob = await toJpeg(canvas, quality);
    if (blob.size <= limit) return blob;
    if (quality > 0.62) {
      quality -= 0.1;
      continue;
    }
    const next = document.createElement("canvas");
    next.width = Math.max(1, Math.round(canvas.width * 0.82));
    next.height = Math.max(1, Math.round(canvas.height * 0.82));
    const context = next.getContext("2d");
    if (!context) break;
    context.drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
    quality = 0.86;
  }
  const last = await toJpeg(canvas, 0.62);
  if (last.size > limit) throw new PrepareError("large", "התמונה גדולה מדי.");
  return last;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PrepareError("type", "לא הצלחנו לקרוא את התמונה הזאת."))),
      "image/jpeg",
      quality,
    );
  });
}
