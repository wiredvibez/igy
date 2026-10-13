import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "collage_admin";

function password(): string {
  return process.env.ADMIN_PASSWORD || "admin";
}

export function passwordMatches(input: string): boolean {
  return digestEqual(input, password());
}

export function adminToken(): string {
  return createHmac("sha256", password()).update("collage-admin-v1").digest("hex");
}

export function tokenMatches(token: string | undefined): boolean {
  if (!token) return false;
  return digestEqual(token, adminToken());
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
