import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and keeps the cookies in
 * sync between the browser and Server Components. Also gates the protected app:
 * unauthenticated users go to /login; authenticated users who haven't picked a
 * username yet go to /onboarding.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() must be called to refresh the token. Do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthOrInternal =
    path.startsWith("/auth") ||
    path.startsWith("/api") || // API routes do their own auth (e.g. CRON_SECRET)
    path.startsWith("/_next") ||
    path === "/favicon.ico";
  const isPublic = path.startsWith("/login") || isAuthOrInternal;

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Username gate: a signed-in user with no username must onboard first. We check
  // the profile once per app navigation (skipped for auth/internal + the
  // onboarding/login routes themselves to avoid a redirect loop).
  if (user && !isAuthOrInternal && !path.startsWith("/login")) {
    const onOnboarding = path.startsWith("/onboarding");
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.username && !onOnboarding) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
    if (profile?.username && onOnboarding) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
