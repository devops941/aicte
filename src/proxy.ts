import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, PUBLIC_PATHS } from "@/lib/auth/config";

/**
 * Route protection at the request boundary. Next 16 runs this on the Node.js
 * runtime, but it still must not import Prisma or bcrypt: this file runs for
 * every request, and scope decisions that need the database are made again
 * inside each route handler.
 */
const { auth } = NextAuth(authConfig);

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isPublic) {
    // Send authenticated users away from the login screen.
    if (pathname === "/login" && req.auth) {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
