import { ADMIN_COOKIE } from "@/lib/auth";
import { json, live } from "@/lib/http";

export async function POST() {
  await live();
  const response = json({ admin: false });
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
