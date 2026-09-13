import "server-only";

import { getAiProvider } from "@/ai/provider";
import { db } from "@/lib/db";
import { canAccessTicket, ticketWhereFor } from "@/lib/permissions";
import type { Viewer } from "@/lib/session";
import { WorkflowError } from "@/domain/workflow";

async function rateLimit(viewer: Viewer) {
  const since = new Date(Date.now() - 60_000);
  const count = await db.auditLog.count({ where: { actorId: viewer.id, action: "AI_REQUESTED", createdAt: { gt: since } } });
  if (count >= 6) throw new WorkflowError("AI draft rate limit reached. Try again in a minute.", "RATE_LIMIT", 429);
  await db.auditLog.create({ data: { actorId: viewer.id, action: "AI_REQUESTED", entityType: "AiDraft", outcome: "STARTED" } });
}

export async function createTicketAiDraft(viewer: Viewer, input: { ticketId: string; kind: "EXTRACTION" | "FOLLOW_UP" | "PROGRESS" }) {
  const ticket = await db.ticket.findUnique({ where: { id: input.ticketId }, select: { id: true, description: true, createdById: true, assignedContractorId: true } });
  if (!ticket || !canAccessTicket(viewer, ticket)) throw new WorkflowError("Work order not found.", "NOT_FOUND", 404);
  if (viewer.role === "CONTRACTOR" && input.kind !== "PROGRESS") throw new WorkflowError("Contractors can only draft progress updates.", "FORBIDDEN", 403);
  await rateLimit(viewer);
  const provider = getAiProvider();
  const content = input.kind === "EXTRACTION" ? await provider.extract(ticket.description.slice(0, 4000)) : await provider.draftMessage({ description: ticket.description.slice(0, 4000), purpose: input.kind === "FOLLOW_UP" ? "follow_up" : "progress" });
  return db.aiDraft.create({ data: { ticketId: ticket.id, requestedById: viewer.id, kind: input.kind, provider: provider.name, model: provider.model, content, evidence: input.kind === "EXTRACTION" && "evidence" in content ? content.evidence : undefined } });
}

export async function createOperationsSummary(viewer: Viewer) {
  await rateLimit(viewer);
  const tickets = await db.ticket.findMany({ where: ticketWhereFor(viewer), orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, reference: true, title: true, status: true } });
  const provider = getAiProvider();
  const summary = await provider.summarize(tickets.map((ticket) => ({ ticketId: ticket.id, reference: ticket.reference, title: ticket.title, status: ticket.status })));
  return { ...summary, provider: provider.name };
}

export async function approveTicketAiDraft(viewer: Viewer, input: { ticketId: string; draftId: string; expectedVersion: number; summary?: string; location?: string; timeMention?: string; missingInfo?: string; message?: string }) {
  if (viewer.role !== "MANAGER") throw new WorkflowError("Only a manager can approve or send AI drafts.", "FORBIDDEN", 403);
  const draft = await db.aiDraft.findFirst({ where: { id: input.draftId, ticketId: input.ticketId, approvedAt: null } });
  if (!draft) throw new WorkflowError("Draft not found or already approved.");
  return db.$transaction(async (tx) => {
    const updated = await tx.ticket.updateMany({ where: { id: input.ticketId, version: input.expectedVersion }, data: draft.kind === "EXTRACTION" ? { aiSummary: input.summary, aiLocation: input.location || null, aiTimeMention: input.timeMention || null, aiMissingInfo: input.missingInfo ? input.missingInfo.split(";").map((item) => item.trim()).filter(Boolean) : [], version: { increment: 1 } } : { version: { increment: 1 } } });
    if (updated.count !== 1) throw new WorkflowError("This work order changed in another session. Refresh and try again.", "VERSION_CONFLICT");
    const version = input.expectedVersion + 1;
    await tx.aiDraft.update({ where: { id: draft.id }, data: { approvedAt: new Date(), approvedById: viewer.id, content: draft.kind === "EXTRACTION" ? { summary: input.summary, location: input.location || null, timeMention: input.timeMention || null, missingInfo: input.missingInfo?.split(";").map((item) => item.trim()).filter(Boolean) ?? [] } : { message: input.message } } });
    const isMessage = draft.kind !== "EXTRACTION";
    await tx.ticketEvent.create({ data: { ticketId: input.ticketId, actorId: viewer.id, type: isMessage ? "AI_DRAFT_SENT" : "AI_DRAFT_APPROVED", message: isMessage ? input.message || "Manager sent an update" : "Manager approved edited intake draft", visibility: isMessage ? "TENANT" : "INTERNAL", ticketVersion: version } });
    await tx.auditLog.create({ data: { actorId: viewer.id, action: "AI_DRAFT_APPROVED", entityType: "AiDraft", entityId: draft.id, outcome: "SUCCESS", metadata: { provider: draft.provider, kind: draft.kind } } });
    if (isMessage) await tx.outboxJob.upsert({ where: { businessKey: `ai-draft:${draft.id}:send` }, create: { businessKey: `ai-draft:${draft.id}:send`, kind: "TENANT_FOLLOW_UP", payload: { ticketId: input.ticketId, ticketVersion: version, message: input.message } }, update: {} });
  });
}
