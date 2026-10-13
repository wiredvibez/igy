export const MAX_PHOTOS = 80;
export const MAX_BYTES = 3 * 1024 * 1024;
export const MAX_EDGE = 2000;
export const MAX_DIMENSION = 4096;
export const VIEWPORT_STALE_MS = 20_000;
export const EXPORT_FALLBACK = { width: 1920, height: 1080 };
export const BOARD_BG = "#0e0d0b";

export const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isId(value: string): boolean {
  return ID_PATTERN.test(value);
}
