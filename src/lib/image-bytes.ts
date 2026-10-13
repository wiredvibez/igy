import { MAX_DIMENSION } from "@/lib/constants";
import type { ImageKind } from "@/lib/types";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type InspectedImage = {
  type: ImageKind;
  width: number;
  height: number;
};

export function inspectImage(bytes: Uint8Array): InspectedImage | null {
  if (isPng(bytes)) {
    if (bytes.length < 24) return null;
    const width = readU32(bytes, 16);
    const height = readU32(bytes, 20);
    return validSize(width, height) ? { type: "image/png", width, height } : null;
  }

  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const size = jpegSize(bytes);
    if (!size || !validSize(size.width, size.height)) return null;
    return { type: "image/jpeg", width: size.width, height: size.height };
  }

  return null;
}

function validSize(width: number, height: number): boolean {
  return width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG.length) return false;
  return PNG.every((byte, index) => bytes[index] === byte);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= bytes.length) return null;

    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isStartOfFrame) {
      if (offset + 8 >= bytes.length) return null;
      const height = (bytes[offset + 5] << 8) + bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) + bytes[offset + 8];
      return { width, height };
    }

    offset += 2 + length;
  }
  return null;
}
