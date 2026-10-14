import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobNotFoundError, del, get, put } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import { isId } from "@/lib/constants";
import type { ImageKind, SessionState, ViewportState } from "@/lib/types";

// Board state lives in Redis, which is strongly consistent, so concurrent uploads can
// safely compare-and-set one key. Vercel Blob only holds the write-once image bytes:
// its reads are eventually consistent, which made a Blob-hosted session file fail
// its ETag check after a handful of uploads.
const SESSION_KEY = "collage:session";
const VIEWPORT_KEY = "collage:viewport";
const VIEWPORT_TTL_SECONDS = 300;

const COMPARE_AND_SET = `
local current = redis.call('GET', KEYS[1])
if current == false then current = '' end
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;

const EMPTY_SESSION: SessionState = {
  version: 0,
  epoch: 1,
  mode: "multiple",
  hero: null,
  photos: [],
};

let redisClient: Redis | null = null;

export function storageConfigured(): boolean {
  return !process.env.VERCEL || remoteStorage();
}

export async function readSession(): Promise<SessionState> {
  if (usesRedis()) {
    const raw = await redis().get<string>(SESSION_KEY);
    return parseSession(raw);
  }
  return readLocalSession();
}

export async function readBoard(): Promise<{ session: SessionState; viewport: ViewportState | null }> {
  if (usesRedis()) {
    const [session, viewport] = await redis().mget<[string | null, string | null]>(SESSION_KEY, VIEWPORT_KEY);
    return { session: parseSession(session), viewport: parseViewport(viewport) };
  }
  const [session, viewport] = await Promise.all([readLocalSession(), readViewport()]);
  return { session, viewport };
}

export async function updateSession(
  mutator: (current: SessionState) => SessionState,
): Promise<SessionState> {
  return usesRedis() ? updateRedis(mutator) : updateLocal(mutator);
}

export async function readViewport(): Promise<ViewportState | null> {
  if (usesRedis()) return parseViewport(await redis().get<string>(VIEWPORT_KEY));
  try {
    return parseViewport(await readFile(viewportFile(), "utf8"));
  } catch {
    return null;
  }
}

export async function writeViewport(viewport: ViewportState): Promise<void> {
  const body = JSON.stringify(viewport);
  if (usesRedis()) {
    await redis().set(VIEWPORT_KEY, body, { ex: VIEWPORT_TTL_SECONDS });
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
      cacheControlMaxAge: 31_536_000,
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
      const result = await get(imagePath(id), { access: "private" });
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
      await del(imagePath(id));
    } catch (error) {
      if (error instanceof BlobNotFoundError) return;
      throw error;
    }
    return;
  }
  await rm(localImage(id), { force: true });
}

// Blob and Redis are used together or not at all, so a dev machine with only a Blob token
// keeps everything in .data/ instead of writing test photos into the production store.
function remoteStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && redisEnv() !== null;
}

function usesBlob(): boolean {
  return remoteStorage();
}

function redisEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function usesRedis(): boolean {
  return remoteStorage();
}

function redis(): Redis {
  if (redisClient) return redisClient;
  const env = redisEnv();
  if (!env) throw new Error("Redis is not configured.");
  // Values are stored and compared as raw JSON strings, so skip the client's own parsing.
  redisClient = new Redis({ ...env, automaticDeserialization: false });
  return redisClient;
}

async function updateRedis(mutator: (current: SessionState) => SessionState): Promise<SessionState> {
  const client = redis();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const raw = await client.get<string>(SESSION_KEY);
    const current = parseSession(raw);
    const next = { ...mutator(structuredClone(current)), version: current.version + 1 };
    const saved = await client.eval<[string, string], number>(
      COMPARE_AND_SET,
      [SESSION_KEY],
      [raw ?? "", JSON.stringify(next)],
    );
    if (Number(saved) === 1) return next;
    await delay(Math.random() * Math.min(250, 20 + attempt * 15));
  }
  throw new Error("Could not save the session.");
}

async function updateLocal(mutator: (current: SessionState) => SessionState): Promise<SessionState> {
  return withLock(async () => {
    const current = await readLocalSession();
    const next = { ...mutator(structuredClone(current)), version: current.version + 1 };
    await writeLocalSession(next);
    return next;
  });
}

function parseSession(raw: string | null): SessionState {
  if (!raw) return { ...EMPTY_SESSION };
  try {
    return normalizeSession(JSON.parse(raw) as SessionState);
  } catch {
    return { ...EMPTY_SESSION };
  }
}

function parseViewport(raw: string | null): ViewportState | null {
  if (!raw) return null;
  try {
    return normalizeViewport(JSON.parse(raw) as ViewportState);
  } catch {
    return null;
  }
}

async function readLocalSession(): Promise<SessionState> {
  try {
    return parseSession(await readFile(sessionFile(), "utf8"));
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
