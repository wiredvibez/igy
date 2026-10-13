"use client";

/* Previews are local object URLs and same-origin uploads, not static image assets. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AdminSheet } from "@/components/join/AdminSheet";
import { PasswordDialog } from "@/components/join/PasswordDialog";
import { prepareImage } from "@/lib/prepare-image";
import { errorMessage, readPayload, useDeviceId, useOrigin, useSession } from "@/lib/use-session";

type PendingPhoto = {
  id: string;
  blob: Blob;
  previewUrl: string;
};

export function JoinScreen() {
  const deviceId = useDeviceId();
  const { session, setSession } = useSession(deviceId, 3000);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const origin = useOrigin();
  const [admin, setAdmin] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const pendingRef = useRef(pending);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    void fetch("/api/admin", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { admin?: boolean }) => setAdmin(Boolean(payload.admin)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      for (const photo of pendingRef.current) URL.revokeObjectURL(photo.previewUrl);
    };
  }, []);

  const single = session?.mode === "single";
  const ownId = session?.ownPhotoIds[0];

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;
    const chosen = single ? files.slice(0, 1) : files.slice(0, 12);
    if (!single && files.length > 12) setError("You can send up to 12 at a time.");
    else setError("");
    setPreparing(true);
    try {
      const prepared: PendingPhoto[] = [];
      for (const file of chosen) {
        const image = await prepareImage(file);
        prepared.push({ id: crypto.randomUUID(), blob: image.blob, previewUrl: URL.createObjectURL(image.blob) });
      }
      setPending((current) => {
        const next = single ? prepared : [...current, ...prepared].slice(-12);
        const kept = new Set(next.map((photo) => photo.previewUrl));
        for (const photo of current) {
          if (!kept.has(photo.previewUrl)) URL.revokeObjectURL(photo.previewUrl);
        }
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This photo’s format could not be converted.");
    } finally {
      setPreparing(false);
    }
  }

  function removePending(id: string) {
    setPending((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  async function upload() {
    if (!session || !deviceId || pending.length === 0) return;
    setBusy(true);
    setError("");
    let epoch = session.epoch;
    for (const item of [...pending]) {
      const body = new FormData();
      body.set("id", item.id);
      body.set("deviceId", deviceId);
      body.set("epoch", String(epoch));
      body.set("file", new File([item.blob], "photo.jpg", { type: "image/jpeg" }));
      try {
        const response = await fetch("/api/upload", { method: "POST", body });
        const payload = await readPayload(response);
        if (!response.ok || !payload.session) {
          setError(errorMessage(payload, "The upload failed. This photo is still here."));
          setBusy(false);
          return;
        }
        epoch = payload.session.epoch;
        setSession(payload.session);
        removePending(item.id);
      } catch {
        setError("The upload failed. This photo is still here.");
        setBusy(false);
        return;
      }
    }
    setBusy(false);
  }

  return (
    <main className="phone">
      <p className="eyebrow">Collage</p>
      <h1>{!session ? "Add a photo" : single ? "Add your photo" : "Add your photos"}</h1>
      <p className="lede">
        {!session
          ? "Choose a photo, then upload it to the screen."
          : single
            ? "Choose one, then upload it to the screen. Taking another replaces yours."
            : "Choose what you want, then upload. Each one lands on the screen as it goes."}
      </p>
      {single && ownId && (
        <img className="own-photo" src={`/api/media/${ownId}`} alt="Your photo currently on the screen" />
      )}
      {pending.length > 0 && (
        <ul className="previews">
          {pending.map((photo) => (
            <li key={photo.id}>
              <img src={photo.previewUrl} alt="" />
              <button type="button" onClick={() => removePending(photo.id)} aria-label="Remove photo" disabled={busy}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button type="button" className="button solid" disabled={busy || preparing} onClick={() => cameraRef.current?.click()}>
          {preparing ? "Preparing" : "Camera"}
        </button>
        <button type="button" className="button ghost" disabled={busy || preparing} onClick={() => libraryRef.current?.click()}>
          Library
        </button>
      </div>
      <button
        type="button"
        className="button upload"
        disabled={busy || preparing || pending.length === 0 || !session || !deviceId}
        onClick={() => void upload()}
      >
        {busy ? "Uploading" : pending.length > 1 ? `Upload ${pending.length}` : "Upload"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <input
        ref={cameraRef}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFiles}
      />
      <input
        ref={libraryRef}
        hidden
        type="file"
        accept="image/*"
        multiple={!single}
        onChange={onFiles}
      />
      <button
        type="button"
        className="gear"
        aria-label="Admin"
        onClick={() => (admin ? setAdminOpen(true) : setPasswordOpen(true))}
      >
        <GearIcon />
      </button>
      {passwordOpen && (
        <PasswordDialog
          onClose={() => setPasswordOpen(false)}
          onSuccess={() => {
            setAdmin(true);
            setPasswordOpen(false);
            setAdminOpen(true);
          }}
        />
      )}
      {adminOpen && session && (
        <AdminSheet
          session={session}
          joinUrl={origin ? `${origin}/join` : ""}
          onClose={() => setAdminOpen(false)}
          onSession={setSession}
        />
      )}
    </main>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.4 13.5a7.7 7.7 0 0 0 .1-1.5 7.7 7.7 0 0 0-.1-1.5l2-1.6a.6.6 0 0 0 .1-.7l-1.9-3.3a.6.6 0 0 0-.7-.3l-2.4 1a7.4 7.4 0 0 0-2.6-1.5l-.4-2.5a.6.6 0 0 0-.6-.5h-3.8a.6.6 0 0 0-.6.5l-.4 2.5a7.4 7.4 0 0 0-2.6 1.5l-2.4-1a.6.6 0 0 0-.7.3L.6 8.2a.6.6 0 0 0 .1.7l2 1.6a7.7 7.7 0 0 0-.1 1.5 7.7 7.7 0 0 0 .1 1.5l-2 1.6a.6.6 0 0 0-.1.7l1.9 3.3a.6.6 0 0 0 .7.3l2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.5a.6.6 0 0 0 .6.5h3.8a.6.6 0 0 0 .6-.5l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1a.6.6 0 0 0 .7-.3l1.9-3.3a.6.6 0 0 0-.1-.7l-2-1.6ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
      />
    </svg>
  );
}
