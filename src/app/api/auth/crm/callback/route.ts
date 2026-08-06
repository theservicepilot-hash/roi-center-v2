import { NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { exchangeCode } from "@/lib/ghl/oauth";
import { onboardFromTokenPayload } from "@/lib/tenancy/provisioning";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError =
    req.nextUrl.searchParams.get("error") ||
    req.nextUrl.searchParams.get("error_description");
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  if (oauthError) {
    console.error("GHL OAuth error redirect", oauthError);
    return Response.redirect(
      `${appUrl}/oauth/success?error=${encodeURIComponent(oauthError)}`,
      302,
    );
  }

  if (!code) {
    return Response.redirect(
      `${appUrl}/oauth/success?error=missing_code`,
      302,
    );
  }

  try {
    const token = await exchangeCode(code);
    const result = await onboardFromTokenPayload(token, {
      initiatorUserId: state || null,
    });
    const params = new URLSearchParams();
    if (result.loginCode) params.set("login_code", result.loginCode);
    if (result.onboarded[0]) params.set("location_id", result.onboarded[0]);
    return Response.redirect(`${appUrl}/oauth/success?${params}`, 302);
  } catch (e) {
    console.error("OAuth callback failed", e);
    const msg =
      e instanceof Error ? e.message.slice(0, 180) : "oauth_failed";
    return Response.redirect(
      `${appUrl}/oauth/success?error=${encodeURIComponent(msg)}`,
      302,
    );
  }
}
