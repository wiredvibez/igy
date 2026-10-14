"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isId } from "@/lib/constants";
import type { PublicSession } from "@/lib/types";

const DEVICE_KEY = "collage-device-id";
let cachedDeviceId: string | null = null;

function subscribeToNothing() {
  return () => {};
}

export function useDeviceId(): string | null {
  return useSyncExternalStore(subscribeToNothing, readDeviceId, () => null);
}

export function useOrigin(): string {
  return useSyncExternalStore(subscribeToNothing, () => window.location.origin, () => "");
}

export function useLocalHost(): boolean {
  return useSyncExternalStore(subscribeToNothing, () => {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  }, () => false);
}

function readDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  const existing = localStorage.getItem(DEVICE_KEY);
  const next = existing && isId(existing) ? existing : crypto.randomUUID();
  if (next !== existing) localStorage.setItem(DEVICE_KEY, next);
  cachedDeviceId = next;
  return next;
}

export function useSession(
  deviceId: string | null,
  intervalMs: number,
  options: { pauseWhenHidden?: boolean } = {},
): {
  session: PublicSession | null;
  unavailable: boolean;
  setSession: (session: PublicSession) => void;
} {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const pauseWhenHidden = options.pauseWhenHidden ?? false;

  useEffect(() => {
    let stop = false;
    let timer = 0;
    let running = false;
    let loaded = false;

    const tick = async () => {
      if (running) return;
      running = true;
      // A hidden phone tab skips the request but keeps the timer. The presenter never pauses:
      // browsers report occluded windows as hidden, and the board must keep updating.
      if (!loaded || !pauseWhenHidden || document.visibilityState === "visible") {
        try {
          const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
          const response = await fetch(`/api/session${query}`, { cache: "no-store" });
          if (response.status === 503) {
            const payload = (await response.json().catch(() => ({}))) as { code?: string };
            if (!stop) setUnavailable(payload.code === "storage");
          } else if (!stop) {
            setUnavailable(false);
          }
          if (response.ok) {
            const next = (await response.json()) as PublicSession;
            loaded = true;
            if (!stop) {
              setSession((current) =>
                current && sameBoard(current, next) ? current : next.version < (current?.version ?? -1) ? current : next,
              );
            }
          }
        } catch {
          // Keep the last board on screen while the next poll retries.
        }
      }
      running = false;
      if (!stop) timer = window.setTimeout(tick, intervalMs);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible" || stop) return;
      window.clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    void tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [deviceId, intervalMs, pauseWhenHidden]);

  return {
    session,
    unavailable,
    setSession: (next) => {
      setSession((current) => {
        if (current && next.version < current.version) return current;
        if (!current || next.ownPhotoIds.length > 0) return next;
        return {
          ...next,
          ownPhotoIds: current.ownPhotoIds.filter((id) => next.photos.some((photo) => photo.id === id)),
        };
      });
    },
  };
}

function sameBoard(current: PublicSession, next: PublicSession): boolean {
  if (next.version < current.version) return true;
  if (current.version !== next.version || current.epoch !== next.epoch || current.mode !== next.mode) {
    return false;
  }
  if (current.hero?.id !== next.hero?.id) return false;
  if (current.photos.length !== next.photos.length) return false;
  for (let index = 0; index < current.photos.length; index += 1) {
    if (current.photos[index].id !== next.photos[index].id) return false;
  }
  if (
    current.viewport?.width !== next.viewport?.width ||
    current.viewport?.height !== next.viewport?.height ||
    current.viewport?.updatedAt !== next.viewport?.updatedAt
  ) {
    return false;
  }
  if (current.ownPhotoIds.join() !== next.ownPhotoIds.join()) return false;
  if (current.build !== next.build) return false;
  return true;
}

export function errorMessage(payload: { error?: string; code?: string }, fallback: string): string {
  if (payload.code === "reset") return "הלוח התאפס הרגע. נסו שוב.";
  if (payload.code === "full") return "הלוח מלא – אין מקום לעוד תמונות.";
  if (payload.code === "large") return "התמונה גדולה מ־10MB.";
  if (payload.code === "type") return "לא הצלחנו לקרוא את התמונה הזאת.";
  if (payload.code === "admin") return "הסיסמה לא נכונה.";
  if (payload.code === "admin-unset") return "סיסמת ניהול לא הוגדרה בשרת (ADMIN_PASSWORD).";
  if (payload.code === "storage") return "האחסון של הלוח לא מוגדר.";
  return fallback;
}

export async function readPayload(response: Response): Promise<{ error?: string; code?: string; session?: PublicSession }> {
  return (await response.json().catch(() => ({}))) as { error?: string; code?: string; session?: PublicSession };
}
