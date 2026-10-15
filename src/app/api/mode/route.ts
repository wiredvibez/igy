import { setMode } from "@/lib/board";
import { isAdminRequest } from "@/lib/auth";
import { boardErrorResponse, json, live, storageGuard } from "@/lib/http";
import { toPublic } from "@/lib/public-session";
import type { UploadMode } from "@/lib/types";

export async function POST(request: Request) {
  await live();
  const blocked = storageGuard();
  if (blocked) return blocked;
  if (!isAdminRequest(request)) return json({ error: "Admin only.", code: "admin" }, 401);

  const body = (await request.json().catch(() => null)) as { mode?: string; epoch?: number } | null;
  const mode: UploadMode | null = body?.mode === "single" || body?.mode === "multiple" ? body.mode : null;
  const epoch = typeof body?.epoch === "number" && Number.isInteger(body.epoch) && body.epoch >= 0 ? body.epoch : null;
  if (!mode || epoch === null) {
    return json({ error: "Choose single or multiple.", code: "id" }, 400);
  }

  try {
    const session = await setMode(epoch, mode);
    return json({ session: toPublic(session, null) });
  } catch (error) {
    const response = boardErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
