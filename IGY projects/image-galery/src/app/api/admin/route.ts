import { isAdminRequest } from "@/lib/auth";
import { json, live } from "@/lib/http";

export async function GET(request: Request) {
  await live();
  return json({ admin: isAdminRequest(request) });
}
