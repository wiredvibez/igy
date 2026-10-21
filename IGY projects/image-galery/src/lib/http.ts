import { connection, NextResponse } from "next/server";
import { BoardError } from "@/lib/board";
import { isId } from "@/lib/constants";
import { storageConfigured } from "@/lib/session-store";

export async function live(): Promise<void> {
  await connection();
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function storageGuard() {
  if (!storageConfigured()) {
    return json({ error: "Storage is not configured.", code: "storage" }, 503);
  }
  return null;
}

export function boardErrorResponse(error: unknown) {
  if (!(error instanceof BoardError)) return null;
  const status = error.code === "large" ? 413 : error.code === "reset" || error.code === "full" ? 409 : 400;
  return json({ error: error.message, code: error.code }, status);
}

export function parseEpoch(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return Number(value);
}

export function parseId(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !isId(value)) return null;
  return value;
}

export async function readBody(file: FormDataEntryValue | null): Promise<Buffer | null> {
  if (!(file instanceof File)) return null;
  return Buffer.from(await file.arrayBuffer());
}
