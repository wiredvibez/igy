"use client";

/* Previews are local object URLs and same-origin uploads, not static image assets. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AdminSheet } from "@/components/join/AdminSheet";
import { PasswordDialog } from "@/components/join/PasswordDialog";
import { MAX_BATCH, MAX_PHOTOS } from "@/lib/constants";
import { prepareImage } from "@/lib/prepare-image";
import { errorMessage, readPayload, useDeviceId, useOrigin, useSession } from "@/lib/use-session";

type PendingPhoto = {
  id: string;
  blob: Blob;
  previewUrl: string;
};

export function JoinScreen() {
  const deviceId = useDeviceId();
  const { session, unavailable, setSession } = useSession(deviceId, 5000, { pauseWhenHidden: true });
  const libraryRef = useRef<HTMLInputElement>(null);
  const origin = useOrigin();
  const [admin, setAdmin] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sent, setSent] = useState(0);

  const pendingRef = useRef(pending);
  const busy = progress !== null;

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

  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(0), 3200);
    return () => window.clearTimeout(timer);
  }, [sent]);

  const single = session?.mode === "single";
  const ownId = session?.ownPhotoIds[0];
  const onBoard = session?.photos.length ?? 0;
  const full = session ? onBoard >= MAX_PHOTOS && !(single && ownId) : unavailable;

  function pick() {
    setError("");
    libraryRef.current?.click();
  }

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;
    const room = single ? 1 : Math.max(0, MAX_BATCH - pendingRef.current.length);
    const chosen = files.slice(0, room);
    let notice = files.length > room ? `אפשר לשלוח עד ${MAX_BATCH} תמונות בכל פעם.` : "";
    setError(notice);
    setPreparing(true);
    try {
      const prepared: PendingPhoto[] = [];
      for (const file of chosen) {
        try {
          const image = await prepareImage(file);
          prepared.push({ id: crypto.randomUUID(), blob: image.blob, previewUrl: URL.createObjectURL(image.blob) });
        } catch (caught) {
          notice = caught instanceof Error ? caught.message : "לא הצלחנו לקרוא את התמונה הזאת.";
        }
      }
      setError(notice);
      if (prepared.length === 0) return;
      const current = pendingRef.current;
      const next = single ? prepared.slice(0, 1) : [...current, ...prepared].slice(0, MAX_BATCH);
      const kept = new Set(next.map((photo) => photo.previewUrl));
      for (const photo of [...current, ...prepared]) {
        if (!kept.has(photo.previewUrl)) URL.revokeObjectURL(photo.previewUrl);
      }
      pendingRef.current = next;
      setPending(next);
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
    const queue = [...pending];
    setError("");
    setProgress({ done: 0, total: queue.length });
    let epoch = session.epoch;
    let uploaded = 0;
    for (const item of queue) {
      const body = new FormData();
      body.set("id", item.id);
      body.set("deviceId", deviceId);
      body.set("epoch", String(epoch));
      body.set("file", new File([item.blob], "photo.jpg", { type: "image/jpeg" }));
      try {
        const response = await fetch("/api/upload", { method: "POST", body });
        const payload = await readPayload(response);
        if (!response.ok || !payload.session) {
          setError(errorMessage(payload, "ההעלאה נכשלה. התמונות שלא עלו עדיין כאן – נסו שוב."));
          break;
        }
        epoch = payload.session.epoch;
        setSession(payload.session);
        removePending(item.id);
        uploaded += 1;
        setProgress({ done: uploaded, total: queue.length });
      } catch {
        setError("אין חיבור. התמונות שלא עלו עדיין כאן – נסו שוב.");
        break;
      }
    }
    setProgress(null);
    if (uploaded > 0) setSent(uploaded);
  }

  const title = "יאללה פה בוחרים תמונה";
  const sendLabel = progress
    ? `שולחים ${Math.min(progress.done + 1, progress.total)}/${progress.total}…`
    : pending.length > 1
      ? `שלחו ${pending.length} תמונות למסך`
      : "שלחו למסך";

  return (
    <main className="phone">
      <header className="phone-top">
        <span className="count-chip" aria-live="polite">
          {session ? `${onBoard}/${MAX_PHOTOS} על המסך` : unavailable ? "הלוח לא זמין" : "מתחברים…"}
        </span>
        <button
          type="button"
          className="gear"
          aria-label="ניהול"
          onClick={() => (admin ? setAdminOpen(true) : setPasswordOpen(true))}
        >
          <GearIcon />
        </button>
      </header>

      <h1 className="sticker">{title}</h1>
      {single && <p className="lede">בחרו תמונה אחת ושלחו. תמונה חדשה תחליף את הקודמת שלכם.</p>}

      <section className="pick-area">
        {pending.length === 0 ? (
          single && ownId ? (
            <button type="button" className="pick own" onClick={pick} disabled={busy || preparing || full}>
              <img src={`/api/media/${ownId}`} alt="התמונה שלך שכרגע על המסך" />
              <span className="pick-label">{preparing ? "מכינים…" : "להחליף תמונה"}</span>
            </button>
          ) : (
            <button type="button" className="pick" onClick={pick} disabled={busy || preparing || full}>
              <span className="pick-icon" aria-hidden="true">
                <PhotoIcon />
              </span>
              <span className="pick-label">
                {!session && unavailable ? "הלוח לא זמין" : full ? "הלוח מלא" : preparing ? "מכינים…" : single ? "בחרו תמונה" : "בחרו תמונות"}
              </span>
              <span className="pick-hint">{!session && unavailable ? "נסו שוב עוד רגע" : full ? "אין מקום לעוד תמונות" : "מהגלריה או מהמצלמה"}</span>
            </button>
          )
        ) : (
          <ul className={pending.length <= 4 ? "previews roomy" : "previews"}>
            {pending.map((photo) => (
              <li key={photo.id}>
                <img src={photo.previewUrl} alt="" />
                <button type="button" onClick={() => removePending(photo.id)} aria-label="הסרת תמונה" disabled={busy}>
                  ×
                </button>
              </li>
            ))}
            {!single && pending.length < MAX_BATCH && (
              <li>
                <button type="button" className="add-more" onClick={pick} disabled={busy || preparing} aria-label="להוסיף עוד תמונות">
                  {preparing ? "…" : "+"}
                </button>
              </li>
            )}
            {single && (
              <li>
                <button type="button" className="add-more swap" onClick={pick} disabled={busy || preparing}>
                  {preparing ? "…" : "החלפה"}
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {sent > 0 && !error && (
        <p className="sent" role="status">
          {sent > 1 ? `${sent} תמונות עלו למסך! 🎉` : "עלה למסך! 🎉"}
        </p>
      )}

      <button
        type="button"
        className="send"
        disabled={busy || preparing || pending.length === 0 || !session || !deviceId}
        onClick={() => void upload()}
      >
        {sendLabel}
      </button>

      <input ref={libraryRef} hidden type="file" accept="image/*" multiple={!single} onChange={onFiles} />
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

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 4h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v8.6l3.8-3.8a1.5 1.5 0 0 1 2.1 0l2.6 2.6 1.6-1.6a1.5 1.5 0 0 1 2.1 0L20 15.6V7a1 1 0 0 0-1-1H5Zm11.5 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"
      />
    </svg>
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
