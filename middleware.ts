import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every navigation so Server Components
 * always see a valid session, and gates the app behind login.
 *
 * Public routes: the login page and Supabase's auth callback. Everything else
 * redirects to /login when there is no user.
 */
const PUBLIC_PATHS = ["/login", "/auth"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve the path the user was trying to reach so /login can send them
    // back after sign-in (critical for shared multiplayer invite links).
    if (pathname && pathname !== "/") {
      url.searchParams.set("next", pathname + (request.nextUrl.search || ""));
    }
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets, the engine files in
     * /stockfish, and image-optimization internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|stockfish|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|js)$).*)",
  ],
};
