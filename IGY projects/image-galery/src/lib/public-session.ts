import { isId } from "@/lib/constants";
import type { Asset, PublicPhoto, PublicSession, SessionState } from "@/lib/types";

export function toPublic(
  session: SessionState,
  deviceId: string | null,
): PublicSession {
  const own = deviceId && isId(deviceId) ? deviceId : null;
  return {
    version: session.version,
    epoch: session.epoch,
    mode: session.mode,
    hero: session.hero ? toPhoto(session.hero) : null,
    photos: session.photos.map(toPhoto),
    ownPhotoIds: own
      ? session.photos.filter((photo) => photo.deviceId === own).map((photo) => photo.id)
      : [],
  };
}

function toPhoto(asset: Asset): PublicPhoto {
  return {
    id: asset.id,
    width: asset.width,
    height: asset.height,
    createdAt: asset.createdAt,
  };
}
