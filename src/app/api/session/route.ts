import { isId } from "@/lib/constants";
import { json, live, storageGuard } from "@/lib/http";
import { toPublic } from "@/lib/public-session";
import { readBoard } from "@/lib/session-store";

export async function GET(request: Request) {
  await live();
  const blocked = storageGuard();
  if (blocked) return blocked;

  const deviceId = new URL(request.url).searchParams.get("deviceId");
  const { session, viewport } = await readBoard();
  return json(toPublic(session, viewport, deviceId && isId(deviceId) ? deviceId : null));
}
