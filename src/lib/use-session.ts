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

export function useSession(deviceId: string | null, intervalMs: number): {
  session: PublicSession | null;
  setSession: (session: PublicSession) => void;
} {
  const [session, setSession] = useState<PublicSession | null>(null);

  useEffect(() => {
    let stop = false;
    let timer = 0;

    const tick = async () => {
      try {
        const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
        const response = await fetch(`/api/session${query}`, { cache: "no-store" });
        if (response.ok) {
          const next = (await response.json()) as PublicSession;
          if (!stop) {
            setSession((current) => (current && sameBoard(current, next) ? current : next.version < (current?.version ?? -1) ? current : next));
          }
        }
      } catch {
        // Keep the last board on screen while the next poll retries.
      }
      if (!stop) timer = window.setTimeout(tick, intervalMs);
    };

    void tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [deviceId, intervalMs]);

  return {
    session,
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
  return true;
}

export function errorMessage(payload: { error?: string; code?: string }, fallback: string): string {
  if (payload.code === "reset") return "The board was just reset. Try again.";
  if (payload.code === "full") return "The board is full.";
  if (payload.code === "large") return "That photo is too large.";
  if (payload.code === "type") return "This photo’s format could not be converted.";
  if (payload.code === "admin") return payload.error || "That password is not right.";
  return payload.error || fallback;
}

export async function readPayload(response: Response): Promise<{ error?: string; code?: string; session?: PublicSession }> {
  return (await response.json().catch(() => ({}))) as { error?: string; code?: string; session?: PublicSession };
}
