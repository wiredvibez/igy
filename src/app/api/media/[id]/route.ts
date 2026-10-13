import { NextResponse } from "next/server";
import { isId } from "@/lib/constants";
import { inspectImage } from "@/lib/image-bytes";
import { json, live, storageGuard } from "@/lib/http";
import { readImage, readSession } from "@/lib/session-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await live();
  const blocked = storageGuard();
  if (blocked) return blocked;

  const { id } = await context.params;
  if (!isId(id)) return json({ error: "Missing photo." }, 404);

  const session = await readSession();
  const known = session.hero?.id === id || session.photos.some((photo) => photo.id === id);
  if (!known) return json({ error: "Missing photo." }, 404);

  const bytes = await readImage(id);
  const image = bytes ? inspectImage(bytes) : null;
  if (!bytes || !image) return json({ error: "Missing photo." }, 404);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": image.type,
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
