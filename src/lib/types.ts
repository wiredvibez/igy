export type UploadMode = "single" | "multiple";

export type ImageKind = "image/jpeg" | "image/png";

export type Asset = {
  id: string;
  deviceId: string;
  width: number;
  height: number;
  createdAt: number;
  contentType: ImageKind;
};

export type SessionState = {
  version: number;
  epoch: number;
  mode: UploadMode;
  hero: Asset | null;
  photos: Asset[];
};

export type ViewportState = {
  width: number;
  height: number;
  updatedAt: number;
};

export type PublicPhoto = {
  id: string;
  width: number;
  height: number;
  createdAt: number;
};

export type PublicSession = {
  version: number;
  epoch: number;
  mode: UploadMode;
  hero: PublicPhoto | null;
  photos: PublicPhoto[];
  viewport: ViewportState | null;
  ownPhotoIds: string[];
};

export type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
