import { addPhoto } from "@/lib/board";
import { boardErrorResponse, json, live, parseEpoch, parseId, readBody, storageGuard } from "@/lib/http";
import { toPublic } from "@/lib/public-session";

export async function POST(request: Request) {
  await live();
  const blocked = storageGuard();
  if (blocked) return blocked;

  const form = await request.formData();
  const id = parseId(form.get("id"));
  const deviceId = parseId(form.get("deviceId"));
  const epoch = parseEpoch(form.get("epoch"));
  const bytes = await readBody(form.get("file"));
  if (!id || !deviceId || epoch === null || !bytes) {
    return json({ error: "The upload is incomplete.", code: "id" }, 400);
  }

  try {
    const session = await addPhoto({ id, deviceId, epoch, bytes });
    return json({ session: toPublic(session, deviceId) });
  } catch (error) {
    const response = boardErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
