import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/request-security";
import { viewerFromHeaders } from "@/lib/route-auth";
import type { IdRouteContext } from "@/lib/route-context";
import { createTicketAiDraft } from "@/services/ai-service";
import { WorkflowError } from "@/domain/workflow";

export async function POST(request: NextRequest, context: IdRouteContext) {
  const viewer = await viewerFromHeaders(request.headers);
  if (!viewer) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try { assertSameOrigin(request); } catch { return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 }); }
  const { id } = await context.params;
  try {
    const body = z.object({ kind: z.enum(["EXTRACTION", "FOLLOW_UP", "PROGRESS"]) }).parse(await request.json());
    const draft = await createTicketAiDraft(viewer, { ticketId: id, ...body });
    return NextResponse.json({ draft: { id: draft.id, kind: draft.kind, provider: draft.provider, model: draft.model, content: draft.content, createdAt: draft.createdAt } }, { status: 201 });
  } catch (error) {
    if (error instanceof WorkflowError && error.code === "NOT_FOUND") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI_DRAFT_FAILED", manualFallback: true }, { status: 400 });
  }
}
