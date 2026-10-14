import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "collage_admin";

// The "admin" default is for local dev only. A deployment without ADMIN_PASSWORD has no admin,
// so nobody at the event can reset the board by guessing the default.
function password(): string | null {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return process.env.VERCEL ? null : "admin";
}

export function adminConfigured(): boolean {
  return password() !== null;
}

export function passwordMatches(input: string): boolean {
  const expected = password();
  return expected !== null && digestEqual(input, expected);
}

export function adminToken(): string | null {
  const expected = password();
  return expected === null ? null : createHmac("sha256", expected).update("collage-admin-v1").digest("hex");
}

export function tokenMatches(token: string | undefined): boolean {
  const expected = adminToken();
  if (!token || !expected) return false;
  return digestEqual(token, expected);
}

export function isAdminRequest(request: Request): boolean {
  return tokenMatches(readCookie(request, COOKIE));
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export const ADMIN_COOKIE = COOKIE;

function digestEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}
