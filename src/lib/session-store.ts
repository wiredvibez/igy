import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  head,
  put,
  del,
} from "@vercel/blob";
import { isId } from "@/lib/constants";
import type { ImageKind, SessionState, ViewportState } from "@/lib/types";

const SESSION_PATH = "collage/session.json";
const VIEWPORT_PATH = "collage/viewport.json";

const EMPTY_SESSION: SessionState = {
  version: 0,
  epoch: 1,
  mode: "multiple",
  hero: null,
  photos: [],
};

export function storageConfigured(): boolean {
  return !process.env.VERCEL || Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readSession(): Promise<SessionState> {
  if (usesBlob()) {
    const loaded = await readBlobJson<SessionState>(SESSION_PATH);
    return loaded ? normalizeSession(loaded.data) : { ...EMPTY_SESSION };
  }
  return readLocalSession();
}

export async function updateSession(
  mutator: (current: SessionState) => SessionState,
): Promise<SessionState> {
  return usesBlob() ? updateBlob(mutator) : updateLocal(mutator);
}

export async function readViewport(): Promise<ViewportState | null> {
  if (usesBlob()) {
    const loaded = await readBlobJson<ViewportState>(VIEWPORT_PATH);
    return loaded ? normalizeViewport(loaded.data) : null;
  }
  try {
    const raw = await readFile(viewportFile(), "utf8");
    return normalizeViewport(JSON.parse(raw) as ViewportState);
  } catch {
    return null;
  }
}

export async function writeViewport(viewport: ViewportState): Promise<void> {
  const body = JSON.stringify(viewport);
  if (usesBlob()) {
    await put(VIEWPORT_PATH, body, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
    return;
  }
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(viewportFile(), body);
}

export async function saveImage(id: string, bytes: Buffer, contentType: ImageKind): Promise<void> {
  assertId(id);
  if (usesBlob()) {
    await put(imagePath(id), bytes, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType,
      cacheControlMaxAge: 60,
    });
    return;
  }
  await mkdir(imageDir(), { recursive: true });
  await writeFile(localImage(id), bytes);
}

export async function readImage(id: string): Promise<Buffer | null> {
  if (!isId(id)) return null;
  if (usesBlob()) {
    try {
      const result = await get(imagePath(id), { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }
  try {
    return await readFile(localImage(id));
  } catch {
    return null;
  }
}

export async function deleteImage(id: string): Promise<void> {
  if (!isId(id)) return;
  if (usesBlob()) {
    try {
      await head(imagePath(id));
      await del(imagePath(id));
    } catch (error) {
      if (error instanceof BlobNotFoundError) return;
      throw error;
    }
    return;
  }
  await rm(localImage(id), { force: true });
}

function usesBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function updateLocal(mutator: (current: SessionState) => SessionState): Promise<SessionState> {
  return withLock(async () => {
    const current = await readLocalSession();
    const next = { ...mutator(structuredClone(current)), version: current.version + 1 };
    await writeLocalSession(next);
    return next;
  });
}

async function updateBlob(mutator: (current: SessionState) => SessionState): Promise<SessionState> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await readBlobJson<SessionState>(SESSION_PATH);
    const current = existing ? normalizeSession(existing.data) : { ...EMPTY_SESSION };
    const next = { ...mutator(structuredClone(current)), version: current.version + 1 };
    const body = JSON.stringify(next);
    try {
      if (!existing) {
        await put(SESSION_PATH, body, {
          access: "private",
          allowOverwrite: false,
          addRandomSuffix: false,
          contentType: "application/json",
          cacheControlMaxAge: 60,
        });
        return next;
      }
      await put(SESSION_PATH, body, {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 60,
        ifMatch: existing.etag,
      });
      return next;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      if (!existing) {
        const raced = await readBlobJson<SessionState>(SESSION_PATH);
        if (raced) continue;
      }
      throw error;
    }
  }
  throw new Error("Could not save the session.");
}

async function readBlobJson<T>(pathname: string): Promise<{ data: T; etag: string } | null> {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return { data: JSON.parse(text) as T, etag: result.blob.etag };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

async function readLocalSession(): Promise<SessionState> {
  try {
    const raw = await readFile(sessionFile(), "utf8");
    return normalizeSession(JSON.parse(raw) as SessionState);
  } catch {
    return { ...EMPTY_SESSION };
  }
}

async function writeLocalSession(session: SessionState): Promise<void> {
  await mkdir(dataRoot(), { recursive: true });
  const temp = path.join(dataRoot(), `.session-${process.pid}.tmp`);
  await writeFile(temp, JSON.stringify(session));
  await rename(temp, sessionFile());
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  await mkdir(dataRoot(), { recursive: true });
  const lockPath = path.join(dataRoot(), ".lock");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        return await fn();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > 10_000) await rm(lockPath, { force: true });
      } catch {
        // The lock vanished between attempts.
      }
      await delay(20 + attempt * 8);
    }
  }
  throw new Error("Could not lock the session.");
}

function normalizeSession(value: SessionState): SessionState {
  return {
    version: Number.isInteger(value.version) ? value.version : 0,
    epoch: Number.isInteger(value.epoch) ? value.epoch : 1,
    mode: value.mode === "single" ? "single" : "multiple",
    hero: value.hero ?? null,
    photos: Array.isArray(value.photos) ? value.photos : [],
  };
}

function normalizeViewport(value: ViewportState): ViewportState | null {
  if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height)) return null;
  return {
    width: value.width,
    height: value.height,
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  };
}

function dataRoot(): string {
  return path.join(process.cwd(), ".data");
}

function sessionFile(): string {
  return path.join(dataRoot(), "session.json");
}

function viewportFile(): string {
  return path.join(dataRoot(), "viewport.json");
}

function imageDir(): string {
  return path.join(dataRoot(), "images");
}

function localImage(id: string): string {
  return path.join(imageDir(), id);
}

function imagePath(id: string): string {
  return `collage/images/${id}`;
}

function assertId(id: string): void {
  if (!isId(id)) throw new Error("Invalid image id.");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
