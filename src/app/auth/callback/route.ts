import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Exchanges the credential from an auth link for a session, then forwards to
// the app. Handles BOTH:
//   • token_hash + type — email links (recovery, invite, magiclink, signup).
//     This is the SSR-safe path: it needs no browser-stored PKCE verifier, so
//     it works for admin/server-generated invites (createClientAccount,
//     /api/intake) as well as user-initiated password resets. Requires the
//     Supabase email templates to link to
//     {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/update-password
//   • code — OAuth / PKCE code exchange (kept for completeness).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=Could not verify the link. Request a new one.`
  );
}
