import { serveScanPng } from "@/lib/scanner/serve-scan-png";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ scanId: string; filename: string }> },
): Promise<Response> {
  const { scanId, filename } = await context.params;
  return serveScanPng({ scanId, filename, kind: "screenshot" });
}
