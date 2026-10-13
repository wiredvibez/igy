import { ADMIN_COOKIE, adminToken, passwordMatches } from "@/lib/auth";
import { json, live } from "@/lib/http";

export async function POST(request: Request) {
  await live();
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = body && typeof body.password === "string" ? body.password : "";
  if (!passwordMatches(password)) {
    return json({ error: "That password is not right.", code: "admin" }, 401);
  }

  const response = json({ admin: true });
  response.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
