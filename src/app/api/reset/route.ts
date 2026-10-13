import { resetBoard } from "@/lib/board";
import { isAdminRequest } from "@/lib/auth";
import { json, live, storageGuard } from "@/lib/http";
import { toPublic } from "@/lib/public-session";
import { readViewport } from "@/lib/session-store";

export async function POST(request: Request) {
  await live();
  const blocked = storageGuard();
  if (blocked) return blocked;
  if (!isAdminRequest(request)) return json({ error: "Admin only.", code: "admin" }, 401);

  const session = await resetBoard();
  return json({ session: toPublic(session, await readViewport(), null) });
}
