import "server-only";

import { randomUUID } from "node:crypto";
import { QuoteStatus, TicketStatus, Visibility } from "@/generated/prisma/client";
import { assertTransition, hasStartPrerequisites, WorkflowError, type WorkflowStatus } from "@/domain/workflow";
import { db } from "@/lib/db";
import { canAccessTicket } from "@/lib/permissions";
import type { Viewer } from "@/lib/session";

export class NotFoundError extends Error {}

function reference() {
  return `RF-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function visibleTicket(viewer: Viewer, ticketId: string) {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || !canAccessTicket(viewer, ticket)) throw new NotFoundError("Work order not found");
  return ticket;
}

async function enqueue(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], input: { key: string; kind: string; payload: object; availableAt?: Date }) {
  await tx.outboxJob.upsert({
    where: { businessKey: input.key },
    create: { businessKey: input.key, kind: input.kind, payload: input.payload, availableAt: input.availableAt },
    update: {},
  });
}

async function updateVersioned(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  ticketId: string,
  expectedVersion: number,
  data: Parameters<typeof tx.ticket.updateMany>[0]["data"],
) {
  const result = await tx.ticket.updateMany({ where: { id: ticketId, version: expectedVersion }, data: { ...data, version: { increment: 1 } } });
  if (result.count !== 1) throw new WorkflowError("This work order changed in another session. Refresh and try again.", "VERSION_CONFLICT");
  return expectedVersion + 1;
}

async function event(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], input: { ticketId: string; actorId: string; type: string; message: string; visibility?: Visibility; version: number; key: string; metadata?: object }) {
  await tx.ticketEvent.create({ data: { ticketId: input.ticketId, actorId: input.actorId, type: input.type, message: input.message, visibility: input.visibility ?? Visibility.PARTICIPANTS, ticketVersion: input.version, idempotencyKey: input.key, metadata: input.metadata } });
  await tx.auditLog.create({ data: { actorId: input.actorId, action: input.type, entityType: "Ticket", entityId: input.ticketId, outcome: "SUCCESS", metadata: input.metadata } });
}

export async function createTicket(viewer: Viewer, input: { propertyId: string; assetId?: string; title: string; description: string; location: string; availability: string; idempotencyKey: string }) {
  if (viewer.role !== "TENANT" && viewer.role !== "MANAGER") throw new WorkflowError("Contractors cannot create tenant requests.", "FORBIDDEN", 403);
  if (viewer.role === "TENANT") {
    const tenancy = await db.tenantProperty.findFirst({ where: { tenantId: viewer.id, propertyId: input.propertyId, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } });
    if (!tenancy) throw new WorkflowError("You are not linked to that property.", "FORBIDDEN", 403);
  }
  if (input.assetId) {
    const asset = await db.asset.findFirst({ where: { id: input.assetId, propertyId: input.propertyId } });
    if (!asset) throw new WorkflowError("The selected asset does not belong to that property.", "INVALID_ASSET", 400);
  }
  const existing = await db.ticketEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { ticketId: true } });
  if (existing) return existing.ticketId;
  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({ data: { reference: reference(), propertyId: input.propertyId, assetId: input.assetId, createdById: viewer.id, title: input.title, description: input.description, location: input.location, availability: input.availability, aiMissingInfo: [] } });
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: "TICKET_CREATED", message: "Maintenance request submitted", version: 1, key: input.idempotencyKey });
    await enqueue(tx, { key: `ticket:${ticket.id}:submitted:v1`, kind: "TICKET_SUBMITTED", payload: { ticketId: ticket.id, ticketVersion: 1 } });
    return ticket.id;
  });
}

export async function triageTicket(viewer: Viewer, input: { ticketId: string; expectedVersion: number; needsInfo: boolean; title: string; summary: string; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"; idempotencyKey: string }) {
  if (viewer.role !== "MANAGER") throw new WorkflowError("Only a manager can confirm triage.", "FORBIDDEN", 403);
  const ticket = await visibleTicket(viewer, input.ticketId);
  const to = input.needsInfo ? TicketStatus.NEEDS_INFO : TicketStatus.TRIAGED;
  assertTransition(ticket.status as WorkflowStatus, to as WorkflowStatus, viewer.role);
  return db.$transaction(async (tx) => {
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, { status: to, title: input.title, aiSummary: input.summary, priority: input.priority, triageConfirmedAt: input.needsInfo ? null : new Date() });
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: input.needsInfo ? "INFORMATION_REQUESTED" : "TRIAGE_CONFIRMED", message: input.needsInfo ? "More information requested" : "Triage confirmed", version, key: input.idempotencyKey });
    await enqueue(tx, { key: `ticket:${ticket.id}:${to.toLowerCase()}:v${version}`, kind: input.needsInfo ? "TENANT_FOLLOW_UP" : "TICKET_TRIAGED", payload: { ticketId: ticket.id, ticketVersion: version } });
  });
}

export async function assignContractor(viewer: Viewer, input: { ticketId: string; contractorId: string; expectedVersion: number; idempotencyKey: string }) {
  if (viewer.role !== "MANAGER") throw new WorkflowError("Only a manager can assign work.", "FORBIDDEN", 403);
  const ticket = await visibleTicket(viewer, input.ticketId);
  if (ticket.status !== TicketStatus.TRIAGED && ticket.status !== TicketStatus.ASSIGNED) throw new WorkflowError("This work order is not ready for assignment.");
  const contractor = await db.user.findFirst({ where: { id: input.contractorId, role: "CONTRACTOR", active: true, contractorProfile: { active: true, servicePostcodes: { has: (await db.property.findUniqueOrThrow({ where: { id: ticket.propertyId } })).postcode } } } });
  if (!contractor) throw new WorkflowError("Contractor is inactive or outside the service area.");
  return db.$transaction(async (tx) => {
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, { status: TicketStatus.ASSIGNED, assignedContractorId: contractor.id });
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: ticket.assignedContractorId ? "CONTRACTOR_REASSIGNED" : "CONTRACTOR_ASSIGNED", message: `Assigned to ${contractor.name}`, version, key: input.idempotencyKey, metadata: { previousContractorId: ticket.assignedContractorId, contractorId: contractor.id } });
    const config = await tx.teamConfig.findUniqueOrThrow({ where: { id: "default" } });
    await enqueue(tx, { key: `ticket:${ticket.id}:assignment:v${version}`, kind: "CONTRACTOR_ASSIGNED", payload: { ticketId: ticket.id, ticketVersion: version, contractorId: contractor.id } });
    await enqueue(tx, { key: `ticket:${ticket.id}:assignment:v${version}:reminder`, kind: "CONTRACTOR_RESPONSE_REMINDER", payload: { ticketId: ticket.id, ticketVersion: version, contractorId: contractor.id }, availableAt: new Date(Date.now() + config.contractorResponseHours * 3_600_000) });
  });
}

export async function submitQuote(viewer: Viewer, input: { ticketId: string; expectedVersion: number; amountCents: number; scope: string; idempotencyKey: string }) {
  const ticket = await visibleTicket(viewer, input.ticketId);
  if (viewer.role !== "CONTRACTOR" || ticket.assignedContractorId !== viewer.id) throw new WorkflowError("Only the current contractor can quote this work.", "FORBIDDEN", 403);
  if (ticket.status !== TicketStatus.ASSIGNED) throw new WorkflowError("Quotes can only be submitted while assigned.");
  return db.$transaction(async (tx) => {
    const latest = await tx.quote.findFirst({ where: { ticketId: ticket.id }, orderBy: { version: "desc" } });
    if (latest && latest.status === QuoteStatus.APPROVED) await tx.quote.update({ where: { id: latest.id }, data: { status: QuoteStatus.SUPERSEDED } });
    const quoteVersion = (latest?.version ?? 0) + 1;
    await tx.quote.create({ data: { ticketId: ticket.id, submittedById: viewer.id, version: quoteVersion, amountCents: input.amountCents, scope: input.scope } });
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, {});
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: "QUOTE_SUBMITTED", message: `Quote version ${quoteVersion} submitted`, version, key: input.idempotencyKey, metadata: { quoteVersion } });
    await enqueue(tx, { key: `ticket:${ticket.id}:quote:${quoteVersion}`, kind: "QUOTE_SUBMITTED", payload: { ticketId: ticket.id, ticketVersion: version, quoteVersion } });
  });
}

export async function decideQuote(viewer: Viewer, input: { ticketId: string; expectedVersion: number; quoteId: string; decision: "APPROVED" | "REJECTED" | "REVISION_REQUESTED"; response?: string; idempotencyKey: string }) {
  if (viewer.role !== "MANAGER") throw new WorkflowError("Only a manager can decide a quote.", "FORBIDDEN", 403);
  const ticket = await visibleTicket(viewer, input.ticketId);
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({ where: { id: input.quoteId, ticketId: ticket.id, status: QuoteStatus.SUBMITTED } });
    if (!quote) throw new WorkflowError("That quote version is no longer awaiting a decision.");
    await tx.quote.update({ where: { id: quote.id }, data: { status: input.decision, managerResponse: input.response, decidedAt: new Date(), decidedById: viewer.id } });
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, {});
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: `QUOTE_${input.decision}`, message: `Quote version ${quote.version} ${input.decision.toLowerCase().replaceAll("_", " ")}`, version, key: input.idempotencyKey, metadata: { quoteVersion: quote.version } });
    await enqueue(tx, { key: `ticket:${ticket.id}:quote:${quote.version}:${input.decision.toLowerCase()}`, kind: `QUOTE_${input.decision}`, payload: { ticketId: ticket.id, ticketVersion: version, quoteVersion: quote.version } });
  });
}

export async function waiveQuote(viewer: Viewer, input: { ticketId: string; expectedVersion: number; reason: string; idempotencyKey: string }) {
  if (viewer.role !== "MANAGER") throw new WorkflowError("Only a manager can waive a quote.", "FORBIDDEN", 403);
  const ticket = await visibleTicket(viewer, input.ticketId);
  if (ticket.status !== TicketStatus.ASSIGNED) throw new WorkflowError("Quote waiver is only available after assignment.");
  return db.$transaction(async (tx) => {
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, { quoteWaivedAt: new Date(), quoteWaivedById: viewer.id, quoteWaiverReason: input.reason });
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: "QUOTE_WAIVED", message: "Quote requirement waived", visibility: Visibility.INTERNAL, version, key: input.idempotencyKey, metadata: { reason: input.reason } });
  });
}

export async function scheduleAppointment(viewer: Viewer, input: { ticketId: string; expectedVersion: number; startsAt: Date; endsAt: Date; notes?: string; idempotencyKey: string }) {
  if (viewer.role !== "MANAGER") throw new WorkflowError("Only a manager can schedule appointments.", "FORBIDDEN", 403);
  const ticket = await visibleTicket(viewer, input.ticketId);
  if (ticket.status !== TicketStatus.ASSIGNED && ticket.status !== TicketStatus.SCHEDULED) throw new WorkflowError("This work order cannot be scheduled now.");
  const approved = await db.quote.findFirst({ where: { ticketId: ticket.id, status: QuoteStatus.APPROVED } });
  if (!approved && !ticket.quoteWaivedAt) throw new WorkflowError("Approve a quote or record a waiver before scheduling.");
  if (input.endsAt <= input.startsAt) throw new WorkflowError("Appointment end must be after its start.");
  return db.$transaction(async (tx) => {
    const latest = await tx.appointment.findFirst({ where: { ticketId: ticket.id }, orderBy: { version: "desc" } });
    if (latest && !latest.supersededAt) await tx.appointment.update({ where: { id: latest.id }, data: { supersededAt: new Date() } });
    const appointmentVersion = (latest?.version ?? 0) + 1;
    await tx.appointment.create({ data: { ticketId: ticket.id, version: appointmentVersion, startsAt: input.startsAt, endsAt: input.endsAt, notes: input.notes, createdById: viewer.id } });
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, { status: TicketStatus.SCHEDULED });
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: latest ? "APPOINTMENT_RESCHEDULED" : "APPOINTMENT_SCHEDULED", message: latest ? "Appointment rescheduled; confirmations reset" : "Appointment scheduled", version, key: input.idempotencyKey, metadata: { appointmentVersion } });
    await enqueue(tx, { key: `ticket:${ticket.id}:appointment:${appointmentVersion}:invitation`, kind: "APPOINTMENT_CONFIRMATION", payload: { ticketId: ticket.id, ticketVersion: version, appointmentVersion } });
    const config = await tx.teamConfig.findUniqueOrThrow({ where: { id: "default" } });
    await enqueue(tx, { key: `ticket:${ticket.id}:appointment:${appointmentVersion}:reminder`, kind: "APPOINTMENT_REMINDER", payload: { ticketId: ticket.id, ticketVersion: version, appointmentVersion }, availableAt: new Date(input.startsAt.getTime() - config.appointmentReminderHours * 3_600_000) });
  });
}

export async function confirmAppointment(viewer: Viewer, input: { ticketId: string; expectedVersion: number; appointmentId: string; idempotencyKey: string }) {
  const ticket = await visibleTicket(viewer, input.ticketId);
  if (viewer.role === "MANAGER") throw new WorkflowError("Managers cannot confirm for another participant.", "FORBIDDEN", 403);
  const appointment = await db.appointment.findFirst({ where: { id: input.appointmentId, ticketId: ticket.id, supersededAt: null } });
  if (!appointment) throw new WorkflowError("That appointment version is no longer current.");
  return db.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appointment.id }, data: viewer.role === "TENANT" ? { tenantConfirmedAt: new Date() } : { contractorConfirmedAt: new Date() } });
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, {});
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: "APPOINTMENT_CONFIRMED", message: `${viewer.role === "TENANT" ? "Tenant" : "Contractor"} confirmed appointment`, version, key: input.idempotencyKey, metadata: { appointmentVersion: appointment.version } });
  });
}

export async function startWork(viewer: Viewer, input: { ticketId: string; expectedVersion: number; idempotencyKey: string }) {
  const ticket = await visibleTicket(viewer, input.ticketId);
  if (viewer.role !== "CONTRACTOR" || ticket.assignedContractorId !== viewer.id) throw new WorkflowError("Only the current contractor can start work.", "FORBIDDEN", 403);
  assertTransition(ticket.status as WorkflowStatus, TicketStatus.IN_PROGRESS, viewer.role);
  const [approved, appointment] = await Promise.all([db.quote.findFirst({ where: { ticketId: ticket.id, status: QuoteStatus.APPROVED } }), db.appointment.findFirst({ where: { ticketId: ticket.id, supersededAt: null }, orderBy: { version: "desc" } })]);
  if (!appointment || !hasStartPrerequisites({ approvedQuote: Boolean(approved), quoteWaived: Boolean(ticket.quoteWaivedAt), tenantConfirmed: Boolean(appointment.tenantConfirmedAt), contractorConfirmed: Boolean(appointment.contractorConfirmedAt) })) throw new WorkflowError("An approved quote or waiver and both appointment confirmations are required.");
  return db.$transaction(async (tx) => {
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, { status: TicketStatus.IN_PROGRESS });
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: "WORK_STARTED", message: "Contractor started work", version, key: input.idempotencyKey });
  });
}

export async function completeWork(viewer: Viewer, input: { ticketId: string; expectedVersion: number; notes: string; actualCostCents?: number; idempotencyKey: string }) {
  const ticket = await visibleTicket(viewer, input.ticketId);
  if (viewer.role !== "CONTRACTOR" || ticket.assignedContractorId !== viewer.id) throw new WorkflowError("Only the current contractor can complete work.", "FORBIDDEN", 403);
  assertTransition(ticket.status as WorkflowStatus, TicketStatus.AWAITING_CONFIRMATION, viewer.role);
  return db.$transaction(async (tx) => {
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, { status: TicketStatus.AWAITING_CONFIRMATION, completionNotes: input.notes, actualCostCents: input.actualCostCents });
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: "WORK_COMPLETED", message: "Work marked complete and sent to tenant", version, key: input.idempotencyKey });
    const config = await tx.teamConfig.findUniqueOrThrow({ where: { id: "default" } });
    await enqueue(tx, { key: `ticket:${ticket.id}:completion:v${version}`, kind: "TENANT_CONFIRMATION", payload: { ticketId: ticket.id, ticketVersion: version } });
    await enqueue(tx, { key: `ticket:${ticket.id}:completion:v${version}:reminder`, kind: "PENDING_CONFIRMATION_REMINDER", payload: { ticketId: ticket.id, ticketVersion: version }, availableAt: new Date(Date.now() + config.pendingConfirmationHours * 3_600_000) });
  });
}

export async function closeTicket(viewer: Viewer, input: { ticketId: string; expectedVersion: number; reason?: string; idempotencyKey: string }) {
  const ticket = await visibleTicket(viewer, input.ticketId);
  assertTransition(ticket.status as WorkflowStatus, TicketStatus.CLOSED, viewer.role);
  if (viewer.role === "MANAGER" && !input.reason) throw new WorkflowError("A manager close reason is required.");
  return db.$transaction(async (tx) => {
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, { status: TicketStatus.CLOSED, closedAt: new Date(), managerCloseReason: viewer.role === "MANAGER" ? input.reason : null });
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: "TICKET_CLOSED", message: viewer.role === "TENANT" ? "Tenant confirmed the repair" : "Manager closed the work order", version, key: input.idempotencyKey, metadata: input.reason ? { reason: input.reason } : undefined });
  });
}

export async function reopenTicket(viewer: Viewer, input: { ticketId: string; expectedVersion: number; reason: string; idempotencyKey: string }) {
  const ticket = await visibleTicket(viewer, input.ticketId);
  assertTransition(ticket.status as WorkflowStatus, TicketStatus.TRIAGED, viewer.role);
  return db.$transaction(async (tx) => {
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, { status: TicketStatus.TRIAGED, closedAt: null, reopenedCount: { increment: 1 } });
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: "TICKET_REOPENED", message: "Work order reopened", version, key: input.idempotencyKey, metadata: { reason: input.reason } });
    await enqueue(tx, { key: `ticket:${ticket.id}:reopened:v${version}`, kind: "TICKET_REOPENED", payload: { ticketId: ticket.id, ticketVersion: version } });
  });
}

export async function addTenantInformation(viewer: Viewer, input: { ticketId: string; expectedVersion: number; information: string; idempotencyKey: string }) {
  const ticket = await visibleTicket(viewer, input.ticketId);
  if (viewer.role !== "TENANT" || ticket.createdById !== viewer.id) throw new WorkflowError("Only the requesting tenant can add this information.", "FORBIDDEN", 403);
  if (ticket.status !== TicketStatus.NEEDS_INFO) throw new WorkflowError("This work order is not waiting for tenant information.");
  return db.$transaction(async (tx) => {
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, {});
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: "TENANT_INFORMATION_ADDED", message: input.information, version, key: input.idempotencyKey });
    await enqueue(tx, { key: `ticket:${ticket.id}:tenant-information:v${version}`, kind: "TENANT_INFORMATION_ADDED", payload: { ticketId: ticket.id, ticketVersion: version } });
  });
}

export async function cancelTicket(viewer: Viewer, input: { ticketId: string; expectedVersion: number; reason: string; idempotencyKey: string }) {
  const ticket = await visibleTicket(viewer, input.ticketId);
  if (viewer.role === "CONTRACTOR") throw new WorkflowError("Contractors cannot cancel work orders.", "FORBIDDEN", 403);
  assertTransition(ticket.status as WorkflowStatus, TicketStatus.CANCELLED, viewer.role);
  return db.$transaction(async (tx) => {
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, { status: TicketStatus.CANCELLED, cancelReason: input.reason, closedAt: new Date() });
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: "TICKET_CANCELLED", message: "Work order cancelled", version, key: input.idempotencyKey, metadata: { reason: input.reason } });
    await enqueue(tx, { key: `ticket:${ticket.id}:cancelled:v${version}`, kind: "TICKET_CANCELLED", payload: { ticketId: ticket.id, ticketVersion: version } });
  });
}

export async function addManagerNote(viewer: Viewer, input: { ticketId: string; expectedVersion: number; message: string; audience: "INTERNAL" | "TENANT"; idempotencyKey: string }) {
  if (viewer.role !== "MANAGER") throw new WorkflowError("Only a manager can add team notes or tenant messages.", "FORBIDDEN", 403);
  const ticket = await visibleTicket(viewer, input.ticketId);
  return db.$transaction(async (tx) => {
    const version = await updateVersioned(tx, ticket.id, input.expectedVersion, {});
    await event(tx, { ticketId: ticket.id, actorId: viewer.id, type: input.audience === "INTERNAL" ? "INTERNAL_NOTE_ADDED" : "TENANT_MESSAGE_SENT", message: input.message, visibility: input.audience === "INTERNAL" ? Visibility.INTERNAL : Visibility.TENANT, version, key: input.idempotencyKey });
    if (input.audience === "TENANT") await enqueue(tx, { key: `ticket:${ticket.id}:manager-message:v${version}`, kind: "MANAGER_MESSAGE", payload: { ticketId: ticket.id, ticketVersion: version, message: input.message } });
  });
}
