"use client";

/* The center preview is a same-origin upload, not a static image asset. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
  const cameraRef = useRef<HTMLInputElement>(null);
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
        setError(errorMessage(payload, "Could not change the setting."));
        return;
      }
      onSession(payload.session);
    } catch {
      setError("Could not reach the board.");
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
        setError(errorMessage(payload, "Could not set the center image."));
        return;
      }
      onSession(payload.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not set the center image.");
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
        setError(errorMessage(payload, "Could not remove the center image."));
        return;
      }
      onSession(payload.session);
    } catch {
      setError("Could not reach the board.");
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
      setError(caught instanceof Error ? caught.message : "Could not build the download.");
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
        setError(errorMessage(payload, "Could not reset the board."));
        return;
      }
      onSession(payload.session);
      setConfirmReset(false);
    } catch {
      setError("Could not reach the board.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sheet">
      <header className="sheet-bar">
        <h2>Admin</h2>
        <button type="button" className="button ghost" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="mode-switch" role="group" aria-label="Photos per phone">
        <button
          type="button"
          className={session.mode === "single" ? "mode on" : "mode"}
          disabled={busy !== null}
          onClick={() => changeMode("single")}
        >
          One each
        </button>
        <button
          type="button"
          className={session.mode === "multiple" ? "mode on" : "mode"}
          disabled={busy !== null}
          onClick={() => changeMode("multiple")}
        >
          Many
        </button>
      </div>
      <p className="hint">
        {session.mode === "single"
          ? "Each phone can have one photo. A new upload replaces it."
          : "Each phone can add as many photos as it likes."}
      </p>

      <div className="sheet-block">
        <h3>Center image</h3>
        {session.hero ? (
          <img className="hero-preview" src={`/api/media/${session.hero.id}`} alt="Current center" />
        ) : (
          <p className="hint">None yet. The QR stays in the center until one is set.</p>
        )}
        <div className="row">
          <button type="button" className="button solid" disabled={busy !== null} onClick={() => cameraRef.current?.click()}>
            Take
          </button>
          <button type="button" className="button ghost" disabled={busy !== null} onClick={() => libraryRef.current?.click()}>
            Library
          </button>
          {session.hero && (
            <button type="button" className="button ghost" disabled={busy !== null} onClick={removeHero}>
              Remove
            </button>
          )}
        </div>
        <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={onHero} />
        <input ref={libraryRef} hidden type="file" accept="image/*" onChange={onHero} />
      </div>

      {session.hero && joinUrl && (
        <div className="sheet-block">
          <h3>Join link</h3>
          <p className="hint">The QR is hidden while the center image is up. People can still open this link.</p>
          <a className="join-link" href={joinUrl}>
            {joinUrl}
          </a>
          <button
            type="button"
            className="button ghost"
            onClick={() => void navigator.clipboard.writeText(joinUrl)}
          >
            Copy link
          </button>
        </div>
      )}

      <div className="sheet-block">
        <h3>Download</h3>
        <p className="hint">
          {stage.live
            ? `This matches the presenter at ${stage.width}×${stage.height}.`
            : "Presenter is not connected. The download will use 1920×1080."}
        </p>
        <div className="row">
          <button type="button" className="button solid" disabled={busy !== null} onClick={() => downloadFile("png")}>
            {busy === "png" ? "Preparing" : "Image"}
          </button>
          <button type="button" className="button ghost" disabled={busy !== null} onClick={() => downloadFile("zip")}>
            {busy === "zip" ? "Preparing" : "All files"}
          </button>
        </div>
        {download && (
          <a className="save-link" href={download.url} download={download.name}>
            Save {download.name}
          </a>
        )}
      </div>

      <div className="sheet-block">
        <button type="button" className="button danger" disabled={busy !== null} onClick={reset}>
          {busy === "reset" ? "Clearing" : confirmReset ? "Clear the board now" : "Reset board"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
