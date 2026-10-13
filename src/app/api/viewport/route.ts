import { json, live, storageGuard } from "@/lib/http";
import { writeViewport } from "@/lib/session-store";

export async function POST(request: Request) {
  await live();
  const blocked = storageGuard();
  if (blocked) return blocked;

  const body = (await request.json().catch(() => null)) as { width?: unknown; height?: unknown } | null;
  const width = clampDimension(body?.width);
  const height = clampDimension(body?.height);
  if (width === null || height === null) {
    return json({ error: "The presenter size is invalid.", code: "id" }, 400);
  }

  await writeViewport({ width, height, updatedAt: Date.now() });
  return json({ ok: true });
}

function clampDimension(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(7680, Math.max(320, Math.round(number)));
}
