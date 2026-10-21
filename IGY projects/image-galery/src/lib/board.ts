import { randomUUID } from "node:crypto";
import { isId, MAX_BYTES, MAX_PHOTOS } from "@/lib/constants";
import { inspectImage } from "@/lib/image-bytes";
import { deleteImage, readSession, saveImage, updateSession } from "@/lib/session-store";
import type { Asset, ImageKind, SessionState, UploadMode } from "@/lib/types";

export class BoardError extends Error {
  constructor(
    public code: "reset" | "full" | "type" | "large" | "id",
    message: string,
  ) {
    super(message);
  }
}

export async function addPhoto(input: {
  epoch: number;
  deviceId: string;
  id: string;
  bytes: Buffer;
}): Promise<SessionState> {
  if (!isId(input.id) || !isId(input.deviceId)) {
    throw new BoardError("id", "That upload is missing an id.");
  }
  const image = checkedImage(input.bytes);
  const asset: Asset = {
    id: input.id,
    deviceId: input.deviceId,
    width: image.width,
    height: image.height,
    createdAt: Date.now(),
    contentType: image.type,
  };

  await saveImage(asset.id, input.bytes, image.type);
  let replacedId: string | null = null;
  try {
    const next = await updateSession((current) => {
      replacedId = null;
      if (current.epoch !== input.epoch) {
        throw new BoardError("reset", "The board was just reset.");
      }
      if (current.hero?.id === asset.id) {
        throw new BoardError("id", "That photo id is already used.");
      }
      const existing = current.photos.find((photo) => photo.id === asset.id);
      if (existing) {
        if (existing.deviceId !== asset.deviceId) {
          throw new BoardError("id", "That photo id is already used.");
        }
        return current;
      }
      if (current.mode === "single") {
        const index = current.photos.findIndex((photo) => photo.deviceId === asset.deviceId);
        if (index >= 0) {
          replacedId = current.photos[index].id;
          const photos = current.photos.slice();
          photos[index] = asset;
          return { ...current, photos };
        }
      }
      if (current.photos.length >= MAX_PHOTOS) {
        throw new BoardError("full", "The board is full.");
      }
      return { ...current, photos: [...current.photos, asset] };
    });
    if (replacedId && !next.photos.some((photo) => photo.id === replacedId)) {
      await deleteImage(replacedId);
    }
    return next;
  } catch (error) {
    await deleteIfUnreferenced(asset.id);
    throw error;
  }
}

export async function setHero(input: {
  epoch: number;
  id: string;
  bytes: Buffer;
}): Promise<SessionState> {
  if (!isId(input.id)) throw new BoardError("id", "That image is missing an id.");
  const image = checkedImage(input.bytes);
  const asset: Asset = {
    id: input.id,
    deviceId: "admin",
    width: image.width,
    height: image.height,
    createdAt: Date.now(),
    contentType: image.type,
  };
  await saveImage(asset.id, input.bytes, image.type);
  let previousId: string | null = null;
  try {
    const next = await updateSession((current) => {
      previousId = null;
      if (current.epoch !== input.epoch) {
        throw new BoardError("reset", "The board was just reset.");
      }
      if (current.photos.some((photo) => photo.id === asset.id)) {
        throw new BoardError("id", "That photo id is already used.");
      }
      if (current.hero?.id === asset.id) return current;
      previousId = current.hero?.id ?? null;
      return { ...current, hero: asset };
    });
    if (previousId && next.hero?.id !== previousId) await deleteImage(previousId);
    return next;
  } catch (error) {
    await deleteIfUnreferenced(asset.id);
    throw error;
  }
}

export async function clearHero(epoch: number): Promise<SessionState> {
  let previousId: string | null = null;
  const next = await updateSession((current) => {
    previousId = null;
    if (current.epoch !== epoch) throw new BoardError("reset", "The board was just reset.");
    previousId = current.hero?.id ?? null;
    return { ...current, hero: null };
  });
  if (previousId && !next.hero) await deleteImage(previousId);
  return next;
}

export async function setMode(epoch: number, mode: UploadMode): Promise<SessionState> {
  return updateSession((current) => {
    if (current.epoch !== epoch) throw new BoardError("reset", "The board was just reset.");
    return { ...current, mode };
  });
}

export async function resetBoard(): Promise<SessionState> {
  let removed: string[] = [];
  const next = await updateSession((current) => {
    removed = [];
    if (current.hero) removed.push(current.hero.id);
    for (const photo of current.photos) removed.push(photo.id);
    return { ...current, epoch: current.epoch + 1, hero: null, photos: [] };
  });
  await Promise.all(removed.map((id) => deleteImage(id).catch(() => undefined)));
  return next;
}

export function newId(): string {
  return randomUUID();
}

function checkedImage(bytes: Buffer): { type: ImageKind; width: number; height: number } {
  if (bytes.length > MAX_BYTES) {
    throw new BoardError("large", "That photo is too large.");
  }
  const image = inspectImage(bytes);
  if (!image) throw new BoardError("type", "Use a JPEG or PNG photo.");
  return image;
}

async function deleteIfUnreferenced(id: string): Promise<void> {
  const latest = await readSession();
  const kept = latest.hero?.id === id || latest.photos.some((photo) => photo.id === id);
  if (!kept) await deleteImage(id).catch(() => undefined);
}
