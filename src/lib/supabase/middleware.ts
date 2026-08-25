import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Invite-only: there is no public /signup. Accounts are created by an admin
// (see src/app/actions/admin.ts), by /api/intake, or by the /onboarding form —
// all of which send a recovery link.
//
// /onboarding is public because the client fills it in BEFORE they have an
// account; it is gated by the ?k= key checked in its own page, not by a
// session.
const PUBLIC_PATHS = [
  "/login",
  "/reset-password",
  "/update-password",
  "/auth",
  "/onboarding",
];

// Public paths a SIGNED-IN user is still allowed to sit on, rather than being
// bounced to /dashboard:
//   • /update-password — reached while signed in via the recovery link
//   • /auth            — the callback must pass through
//   • /onboarding      — so an admin can open and test the live form, and so a
//                        client who is already signed in on the same browser
//                        can still complete an intake link
const SIGNED_IN_ALLOWED = ["/update-password", "/auth", "/onboarding"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function updateSession(request: NextRequest) {
  // Forward the full URL so the app layout can read the ?as= switcher param
  request.headers.set("x-url", request.url);

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Not signed in → only public pages allowed
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed in → keep them out of auth pages, except the ones listed above.
  if (
    user &&
    isPublic(pathname) &&
    !SIGNED_IN_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Root → dashboard (middleware handles "/" so no root page.tsx needed)
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
