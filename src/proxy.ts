import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { gateDecision } from "@/lib/admin/gate";

// Runs only for /admin. Refreshes the Supabase session cookie and sends signed-out visitors to the login page.
// This is the FIRST check, not the authorization boundary: the admin layout re-verifies staff access on the server
// and the database enforces RLS.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  let signedIn = false;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    // getUser() validates the token with the auth server; getSession() would trust the cookie blindly.
    const { data } = await supabase.auth.getUser();
    signedIn = !!data.user;
  }

  const gate = gateDecision(request.nextUrl.pathname, request.nextUrl.search, signedIn);
  if (gate.action === "redirect") {
    const redirect = NextResponse.redirect(new URL(gate.to, request.url));
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
