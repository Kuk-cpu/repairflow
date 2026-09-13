import { assertSameOrigin } from "@/lib/request-security";
import { viewerFromHeaders } from "@/lib/route-auth";
import { createOperationsSummary } from "@/services/ai-service";

export async function POST(request: Request) {
  const viewer = await viewerFromHeaders(request.headers);
  if (!viewer) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try { assertSameOrigin(request); } catch { return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 }); }
  try {
    const summary = await createOperationsSummary(viewer);
    return Response.json({ summary });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "SUMMARY_FAILED", manualFallback: true }, { status: 400 });
  }
}
