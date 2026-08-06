import { NextRequest } from "next/server";

import { buildAuthorizeUrl } from "@/lib/ghl/oauth";
import { jsonError } from "@/lib/auth/request";

export async function GET(req: NextRequest) {
  try {
    const state = req.nextUrl.searchParams.get("state") || "";
    const url = buildAuthorizeUrl(state);
    return Response.redirect(url, 302);
  } catch (e) {
    return jsonError(e);
  }
}
