import { NextResponse } from "next/server";
import { signOut } from "@/auth";

/**
 * Clears a stale session and returns to the login screen. Reached when a page
 * holds a validly-signed JWT whose user no longer exists or has been
 * deactivated: the middleware trusts the cookie, but the database-backed actor
 * lookup fails. Without dropping the cookie here, /login would just bounce the
 * "authenticated" request straight back to /dashboard, looping forever.
 */
export async function GET(request: Request) {
  await signOut({ redirect: false });
  const response = NextResponse.redirect(new URL("/login", request.url));
  // Belt-and-suspenders: ensure the session cookie is gone even if the signOut
  // cookie mutation is not merged onto this custom response.
  response.cookies.delete("authjs.session-token");
  response.cookies.delete("__Secure-authjs.session-token");
  return response;
}
