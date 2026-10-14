"use client";

/* The center preview is a same-origin upload, not a static image asset. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { MAX_PHOTOS } from "@/lib/constants";
import { exportStage } from "@/lib/layout";
import { prepareImage } from "@/lib/prepare-image";
import { errorMessage, readPayload } from "@/lib/use-session";
import type { PublicSession, UploadMode } from "@/lib/types";

export function AdminSheet({
  session,
  joinUrl,
  onClose,
  onSession,
}: {
  session: PublicSession;
  joinUrl: string;
  onClose: () => void;
  onSession: (session: PublicSession) => void;
}) {
  const libraryRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const stage = exportStage(session.viewport);

  useEffect(() => {
    return () => {
      if (download) URL.revokeObjectURL(download.url);
    };
  }, [download]);

  async function changeMode(mode: UploadMode) {
    setBusy("mode");
    setError("");
    try {
      const response = await fetch("/api/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, epoch: session.epoch }),
      });
      const payload = await readPayload(response);
      if (!response.ok || !payload.session) {
        setError(errorMessage(payload, "לא הצלחנו לשנות את ההגדרה."));
        return;
      }
      onSession(payload.session);
    } catch {
      setError("אין חיבור ללוח.");
    } finally {
      setBusy(null);
    }
  }

  async function onHero(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("hero");
    setError("");
    try {
      const image = await prepareImage(file);
      const body = new FormData();
      body.set("id", crypto.randomUUID());
      body.set("epoch", String(session.epoch));
      body.set("file", new File([image.blob], "center.jpg", { type: "image/jpeg" }));
      const response = await fetch("/api/hero", { method: "POST", body });
      const payload = await readPayload(response);
      if (!response.ok || !payload.session) {
        setError(errorMessage(payload, "לא הצלחנו להגדיר את התמונה המרכזית."));
        return;
      }
      onSession(payload.session);
    } catch (caught) {
      setError(caught instanceof Error && /[\u0590-\u05ff]/.test(caught.message) ? caught.message : "לא הצלחנו להגדיר את התמונה המרכזית.");
    } finally {
      setBusy(null);
    }
  }

  async function removeHero() {
    setBusy("hero");
    setError("");
    try {
      const response = await fetch(`/api/hero?epoch=${session.epoch}`, { method: "DELETE" });
      const payload = await readPayload(response);
      if (!response.ok || !payload.session) {
        setError(errorMessage(payload, "לא הצלחנו להסיר את התמונה המרכזית."));
        return;
      }
      onSession(payload.session);
    } catch {
      setError("אין חיבור ללוח.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadFile(kind: "png" | "zip") {
    setBusy(kind);
    setError("");
    try {
      const board = await import("@/lib/render-board");
      const blob =
        kind === "png"
          ? await board.renderBoardPng(session, joinUrl)
          : await board.renderBoardZip(session, joinUrl);
      const name = kind === "png" ? "collage.png" : "collage.zip";
      const url = URL.createObjectURL(blob);
      setDownload((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url, name };
      });
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
    } catch (caught) {
      setError(caught instanceof Error && /[\u0590-\u05ff]/.test(caught.message) ? caught.message : "לא הצלחנו להכין את ההורדה.");
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setBusy("reset");
    setError("");
    try {
      const response = await fetch("/api/reset", { method: "POST" });
      const payload = await readPayload(response);
      if (!response.ok || !payload.session) {
        setError(errorMessage(payload, "לא הצלחנו לאפס את הלוח."));
        return;
      }
      onSession(payload.session);
      setConfirmReset(false);
    } catch {
      setError("אין חיבור ללוח.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sheet">
      <header className="sheet-bar">
        <h2>ניהול</h2>
        <button type="button" className="button ghost" onClick={onClose}>
          סגירה
        </button>
      </header>
      <div className="mode-switch" role="group" aria-label="תמונות לכל טלפון">
        <button
          type="button"
          className={session.mode === "single" ? "mode on" : "mode"}
          disabled={busy !== null}
          onClick={() => changeMode("single")}
        >
          אחת לכל אחד
        </button>
        <button
          type="button"
          className={session.mode === "multiple" ? "mode on" : "mode"}
          disabled={busy !== null}
          onClick={() => changeMode("multiple")}
        >
          בלי הגבלה
        </button>
      </div>
      <p className="hint">
        {session.mode === "single"
          ? "לכל טלפון תמונה אחת. העלאה חדשה מחליפה אותה."
          : `כל טלפון יכול להעלות כמה תמונות שרוצה (עד ${MAX_PHOTOS} בלוח).`}
      </p>

      <div className="sheet-block">
        <h3>תמונה מרכזית</h3>
        {session.hero ? (
          <img className="hero-preview" src={`/api/media/${session.hero.id}`} alt="התמונה המרכזית הנוכחית" />
        ) : (
          <p className="hint">אין כרגע. קוד ה־QR נשאר במרכז עד שתוגדר תמונה.</p>
        )}
        <div className="row">
          <button type="button" className="button solid" disabled={busy !== null} onClick={() => libraryRef.current?.click()}>
            {busy === "hero" ? "מעלים…" : session.hero ? "החלפת תמונה" : "בחירת תמונה"}
          </button>
          {session.hero && (
            <button type="button" className="button ghost" disabled={busy !== null} onClick={removeHero}>
              הסרה
            </button>
          )}
        </div>
        <input ref={libraryRef} hidden type="file" accept="image/*" onChange={onHero} />
      </div>

      {session.hero && joinUrl && (
        <div className="sheet-block">
          <h3>קישור הצטרפות</h3>
          <p className="hint">קוד ה־QR מוסתר כל עוד יש תמונה מרכזית. אפשר עדיין להיכנס דרך הקישור.</p>
          <a className="join-link" href={joinUrl}>
            {joinUrl}
          </a>
          <button
            type="button"
            className="button ghost"
            onClick={() => void navigator.clipboard.writeText(joinUrl)}
          >
            העתקת קישור
          </button>
        </div>
      )}

      <div className="sheet-block">
        <h3>הורדה</h3>
        <p className="hint">
          {stage.live
            ? `בגודל של מסך ההצגה: \u2066${stage.width}×${stage.height}\u2069.`
            : "מסך ההצגה לא מחובר. ההורדה תהיה בגודל \u20661920×1080\u2069."}
        </p>
        <div className="row">
          <button type="button" className="button solid" disabled={busy !== null} onClick={() => downloadFile("png")}>
            {busy === "png" ? "מכינים…" : "תמונת הלוח"}
          </button>
          <button type="button" className="button ghost" disabled={busy !== null} onClick={() => downloadFile("zip")}>
            {busy === "zip" ? "מכינים…" : "כל הקבצים"}
          </button>
        </div>
        {download && (
          <a className="save-link" href={download.url} download={download.name}>
            שמירת {download.name}
          </a>
        )}
      </div>

      <div className="sheet-block">
        <button type="button" className="button danger" disabled={busy !== null} onClick={reset}>
          {busy === "reset" ? "מנקים…" : confirmReset ? "בטוח? לנקות את הלוח עכשיו" : "איפוס הלוח"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
