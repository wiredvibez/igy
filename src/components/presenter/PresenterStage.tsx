"use client";

/* User photos are positioned and cropped by the collage layout, not by the image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { BOARD_BG } from "@/lib/constants";
import { containRect, expandedRect, layoutBoard, photoAspect } from "@/lib/layout";
import { QR_QUIET, qrDrawSize, qrGrid } from "@/lib/qr";
import { useLocalHost, useOrigin, useSession } from "@/lib/use-session";
import type { Rect } from "@/lib/types";

export function PresenterStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const { session, unavailable } = useSession(null, 1500);
  const origin = useOrigin();
  const localHost = useLocalHost();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size.width < 320 || size.height < 320) return;
    const send = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/viewport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(size),
      });
    };
    send();
    const timer = window.setInterval(send, 10_000);
    document.addEventListener("visibilitychange", send);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
    };
  }, [size]);

  // A new deployment: reload so a presenter left open for hours runs the current code.
  const build = session?.build ?? null;
  const firstBuild = useRef<string | null>(null);
  useEffect(() => {
    if (!build) return;
    if (firstBuild.current === null) firstBuild.current = build;
    else if (build !== firstBuild.current) window.location.reload();
  }, [build]);

  // New photos (and a new center image) are fetched and decoded before the board makes
  // room for them, so they appear straight into their cell instead of into white space.
  const imageIds = useMemo(
    () => [...(session?.hero ? [session.hero.id] : []), ...(session?.photos.map((photo) => photo.id) ?? [])],
    [session],
  );
  const loaded = useLoadedImages(session ? imageIds : null);
  const currentHero = session?.hero ?? null;
  const [lastHero, setLastHero] = useState(currentHero);
  const heroReady = currentHero !== null && loaded.has(currentHero.id);
  if (heroReady && lastHero?.id !== currentHero.id) setLastHero(currentHero);
  // A removed center image must not come back while a later one loads.
  if (!currentHero && lastHero) setLastHero(null);
  // While a replacement center image loads, the previous one stays up.
  const hero = currentHero ? (heroReady ? currentHero : lastHero) : null;
  const shownPhotos = useMemo(
    () => session?.photos.filter((photo) => loaded.has(photo.id)) ?? [],
    [session, loaded],
  );

  const openStillThere =
    openId !== null && (hero?.id === openId || shownPhotos.some((photo) => photo.id === openId));
  const activeOpenId = openStillThere ? openId : null;

  useEffect(() => {
    if (activeOpenId || !liftedId) return;
    const timer = window.setTimeout(() => setLiftedId(null), 900);
    return () => window.clearTimeout(timer);
  }, [activeOpenId, liftedId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const layout = useMemo(() => {
    if (!session || size.width === 0 || size.height === 0) return null;
    return layoutBoard({
      stageWidth: size.width,
      stageHeight: size.height,
      photos: shownPhotos,
      hero,
    });
  }, [session, shownPhotos, hero, size.height, size.width]);

  const joinUrl = origin ? `${origin}/join` : "";

  function close() {
    setOpenId(null);
  }

  function toggle(id: string) {
    if (openId === id) {
      close();
      return;
    }
    setOpenId(id);
    setLiftedId(id);
  }

  return (
    <div ref={stageRef} className="stage" style={{ background: BOARD_BG }} onClick={close}>
      {layout?.tiles.map((tile) => {
        const photo = session?.photos.find((item) => item.id === tile.id);
        if (!photo) return null;
        const lifted = liftedId === photo.id;
        return (
          <FrameButton
            key={photo.id}
            rect={
              lifted && activeOpenId === photo.id
                ? expandedRect(size.width, size.height, photoAspect(photo))
                : tile.rect
            }
            src={`/api/media/${photo.id}`}
            alt="תמונה מהקהל"
            pressed={activeOpenId === photo.id}
            lifted={lifted}
            fit={lifted ? "contain" : "cover"}
            onToggle={(event) => {
              event.stopPropagation();
              toggle(photo.id);
            }}
            onRest={() => {
              if (activeOpenId !== photo.id) setLiftedId((current) => (current === photo.id ? null : current));
            }}
          />
        );
      })}
      {layout && hero && layout.center.kind === "hero" && (
        <FrameButton
          rect={
            liftedId === hero.id && activeOpenId === hero.id
              ? expandedRect(size.width, size.height, photoAspect(hero))
              : containRect(layout.center, photoAspect(hero))
          }
          src={`/api/media/${hero.id}`}
          alt="תמונה מרכזית"
          pressed={activeOpenId === hero.id}
          lifted={liftedId === hero.id}
          fit="contain"
          onToggle={(event) => {
            event.stopPropagation();
            toggle(hero.id);
          }}
          onRest={() => {
            if (activeOpenId !== hero.id) setLiftedId((current) => (current === hero.id ? null : current));
          }}
        />
      )}
      {layout?.center.kind === "qr" && joinUrl && <QrCard rect={layout.center} url={joinUrl} />}
      {(activeOpenId || liftedId) && (
        <button type="button" className="scrim" aria-label="סגירת התמונה" onClick={close} />
      )}
      {unavailable && <p className="local-note">האחסון של הלוח לא מוגדר (Redis / Blob).</p>}
      {localHost && !unavailable && !hero && (
        <p className="local-note">פתחו את הדף מכתובת הרשת של המחשב כדי שטלפונים יוכלו לסרוק את הקוד.</p>
      )}
    </div>
  );
}

/**
 * Ids whose images are downloaded and decoded. Everything on the board when the page
 * opens counts as ready at once (the first paint shouldn't wait); later arrivals are
 * fetched in the background and join when ready, or when they fail or take over eight
 * seconds, so a broken or slow image can't hold the board back.
 */
function useLoadedImages(ids: string[] | null): Set<string> {
  const [loaded, setLoaded] = useState<Set<string> | null>(null);
  const requested = useRef(new Set<string>());
  const key = ids?.join(",") ?? null;
  if (loaded === null && ids !== null) setLoaded(new Set(ids));

  useEffect(() => {
    if (key === null || loaded === null) return;
    for (const id of key ? key.split(",") : []) {
      if (loaded.has(id) || requested.current.has(id)) continue;
      requested.current.add(id);
      const image = new Image();
      image.src = `/api/media/${id}`;
      // A hidden or busy window can stall decoding; after a few seconds it joins anyway.
      const timeout = new Promise((resolve) => window.setTimeout(resolve, 8000));
      void Promise.race([image.decode().catch(() => undefined), timeout]).then(() =>
        setLoaded((previous) => (previous?.has(id) ? previous : new Set(previous).add(id))),
      );
    }
  }, [key, loaded]);

  return loaded ?? EMPTY;
}

const EMPTY = new Set<string>();

function FrameButton({
  rect,
  src,
  alt,
  pressed,
  lifted,
  fit,
  onToggle,
  onRest,
}: {
  rect: Rect;
  src: string;
  alt: string;
  pressed: boolean;
  lifted: boolean;
  fit: "cover" | "contain";
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  onRest: () => void;
}) {
  return (
    <button
      type="button"
      className="frame"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        zIndex: lifted ? 5 : 1,
      }}
      aria-label={alt}
      aria-pressed={pressed}
      onClick={onToggle}
      onTransitionEnd={(event) => {
        if (event.propertyName === "width" || event.propertyName === "height") onRest();
      }}
    >
      <img src={src} alt={alt} style={{ objectFit: fit }} />
    </button>
  );
}

function QrCard({ rect, url }: { rect: Rect; url: string }) {
  const grid = useMemo(() => qrGrid(url), [url]);
  const { moduleSize, pixelSize } = qrDrawSize(Math.min(rect.width, rect.height) * 0.94, grid.size);
  const path = grid.modules
    .map((on, index) => {
      if (!on) return "";
      const col = index % grid.size;
      const row = Math.floor(index / grid.size);
      const x = (col + QR_QUIET) * moduleSize;
      const y = (row + QR_QUIET) * moduleSize;
      return `M${x} ${y}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
    })
    .join("");

  return (
    <div className="qr-card" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
      <svg width={pixelSize} height={pixelSize} viewBox={`0 0 ${pixelSize} ${pixelSize}`} role="img" aria-label="קוד QR להעלאת תמונה">
        <path d={path} fill="#000000" />
      </svg>
    </div>
  );
}
