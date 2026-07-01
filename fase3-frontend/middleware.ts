// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function getUserFromToken(token: string | null) {
  if (!token || !SUPABASE_URL) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.user ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Try to find the access token in cookies. Common cookie names used by Supabase
  // include 'sb-access-token' or '<prefix>-auth-token'. We try a few patterns.
  const allCookies = request.cookies.getAll ? request.cookies.getAll() : [];
  const tokenCookie =
    allCookies.find((c) => c.name === "sb-access-token") ||
    allCookies.find((c) => c.name === "supabase-auth-token") ||
    allCookies.find((c) => c.name.endsWith("-auth-token"));

  const token = tokenCookie?.value ?? null;

  const user = await getUserFromToken(token);
  const pathname = request.nextUrl.pathname;

  // Public routes
  if (pathname.startsWith("/auth")) return supabaseResponse;

  // Redirect unauthenticated to login
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // Redirect authenticated root to dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
