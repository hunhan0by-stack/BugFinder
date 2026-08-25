import "server-only";

import { getRuntimeConfig } from "@/lib/config/runtime-config";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(): Promise<Response> {
  const config = getRuntimeConfig();
  return Response.json(
    {
      status: "ok",
      version: config.appVersion,
      environment: config.environmentClass,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
