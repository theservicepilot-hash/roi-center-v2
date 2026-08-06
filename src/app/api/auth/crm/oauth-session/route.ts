import { NextRequest } from "next/server";

import { ApiError, jsonError, jsonOk } from "@/lib/auth/request";
import { consumeLoginCode } from "@/lib/tenancy/provisioning";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { login_code?: string };
    const code = String(body.login_code || "").trim();
    if (!code) throw new ApiError("login_code required", 400);
    const session = await consumeLoginCode(code);
    if (!session) throw new ApiError("Invalid or expired login code", 401);
    return jsonOk(session);
  } catch (e) {
    return jsonError(e);
  }
}
