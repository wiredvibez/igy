import { clearHero, setHero } from "@/lib/board";
import { isAdminRequest } from "@/lib/auth";
import { boardErrorResponse, json, live, parseEpoch, parseId, readBody, storageGuard } from "@/lib/http";
import { toPublic } from "@/lib/public-session";
import { readViewport } from "@/lib/session-store";

export async function POST(request: Request) {
  await live();
  const blocked = storageGuard() ?? adminOnly(request);
  if (blocked) return blocked;

  const form = await request.formData();
  const id = parseId(form.get("id"));
  const epoch = parseEpoch(form.get("epoch"));
  const bytes = await readBody(form.get("file"));
  if (!id || epoch === null || !bytes) {
    return json({ error: "The center image is incomplete.", code: "id" }, 400);
  }

  try {
    const session = await setHero({ id, epoch, bytes });
    return json({ session: toPublic(session, await readViewport(), null) });
  } catch (error) {
    const response = boardErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(request: Request) {
  await live();
  const blocked = storageGuard() ?? adminOnly(request);
  if (blocked) return blocked;

  const epoch = parseEpoch(new URL(request.url).searchParams.get("epoch"));
  if (epoch === null) return json({ error: "The board epoch is missing.", code: "id" }, 400);

  try {
    const session = await clearHero(epoch);
    return json({ session: toPublic(session, await readViewport(), null) });
  } catch (error) {
    const response = boardErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

function adminOnly(request: Request) {
  if (!isAdminRequest(request)) return json({ error: "Admin only.", code: "admin" }, 401);
  return null;
}
