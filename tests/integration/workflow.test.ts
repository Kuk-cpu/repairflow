import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { addManagerNote, addTenantInformation, assignContractor, confirmAppointment, createTicket, decideQuote, scheduleAppointment, submitQuote, triageTicket } from "@/services/ticket-service";
import type { Viewer } from "@/lib/session";
import { processOne } from "@/workers/outbox-worker";
import { getDashboard } from "@/data/dashboard";
import { getTicket } from "@/data/tickets";
import { acceptInvitation, createInvitation, endTenantPropertyLink, linkTenant, revokeInvitation } from "@/services/admin-service";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must target the integration database");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const manager: Viewer = { id: "demo-manager", name: "Maya", email: "manager@repairflow.test", role: "MANAGER", active: true };
const tenantA: Viewer = { id: "demo-tenant-a", name: "Alex", email: "alex@repairflow.test", role: "TENANT", active: true };
const tenantB: Viewer = { id: "demo-tenant-b", name: "Priya", email: "priya@repairflow.test", role: "TENANT", active: true };
const contractorA: Viewer = { id: "demo-contractor-a", name: "Sam", email: "sam@repairflow.test", role: "CONTRACTOR", active: true };
const contractorB: Viewer = { id: "demo-contractor-b", name: "Jordan", email: "jordan@repairflow.test", role: "CONTRACTOR", active: true };

describe("PostgreSQL workflow integration", () => {
  let ticketId = "";

  it("prevents a tenant creating work for another tenant property", async () => {
    await expect(createTicket(tenantA, { propertyId: "demo-property-park", title: "[integration] denied", description: "Water leak", location: "Kitchen", availability: "Monday", idempotencyKey: randomUUID() })).rejects.toThrow(/not linked/);
    await expect(createTicket(tenantB, { propertyId: "demo-property-park", assetId: "demo-asset-hot-water", title: "[integration] wrong asset", description: "Water leak", location: "Kitchen", availability: "Monday", idempotencyKey: randomUUID() })).rejects.toThrow(/does not belong/);
  });

  it("keeps invitations single-use and bound to the manager-selected role", async () => {
    const email = `integration-${randomUUID()}@repairflow.test`;
    const token = await createInvitation(manager, { email, role: "TENANT" });
    expect(await db.auditLog.count({ where: { actorId: manager.id, action: "INVITATION_CREATED", entityType: "Invitation" } })).toBeGreaterThan(0);
    const user = await acceptInvitation({ token, name: "Integration Invitee", password: "ValidPassword!2026" });
    expect(user.role).toBe("TENANT");
    await expect(acceptInvitation({ token, name: "Second Claim", password: "ValidPassword!2026" })).rejects.toThrow(/invalid|used/i);
    await db.user.delete({ where: { id: user.id } });
    await db.invitation.deleteMany({ where: { email } });
  });

  it("rejects revoked invitations", async () => {
    const email = `integration-revoked-${randomUUID()}@repairflow.test`;
    const token = await createInvitation(manager, { email, role: "CONTRACTOR" });
    const invitation = await db.invitation.findFirstOrThrow({ where: { email } });
    await revokeInvitation(manager, { invitationId: invitation.id });
    await expect(acceptInvitation({ token, name: "Revoked Invitee", password: "ValidPassword!2026" })).rejects.toThrow(/revoked|invalid/i);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).revokedAt).not.toBeNull();
    await db.invitation.delete({ where: { id: invitation.id } });
  });

  it("keeps tenant property link creation and ending atomic under retries", async () => {
    const links = await Promise.all([
      linkTenant(manager, { tenantId: tenantB.id, propertyId: "demo-property-harbour" }),
      linkTenant(manager, { tenantId: tenantB.id, propertyId: "demo-property-harbour" }),
    ]);
    expect(links[0].id).toBe(links[1].id);
    expect(await db.tenantProperty.count({ where: { tenantId: tenantB.id, propertyId: "demo-property-harbour", endsAt: null } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "TENANT_PROPERTY_LINKED", entityId: links[0].id } })).toBe(1);

    const endings = await Promise.allSettled([
      endTenantPropertyLink(manager, { linkId: links[0].id }),
      endTenantPropertyLink(manager, { linkId: links[0].id }),
    ]);
    expect(endings.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(endings.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(createTicket(tenantB, { propertyId: "demo-property-harbour", title: "[integration] ended tenancy", description: "Water leak", location: "Kitchen", availability: "Monday", idempotencyKey: randomUUID() })).rejects.toThrow(/not linked/);
    expect((await db.tenantProperty.findUniqueOrThrow({ where: { id: links[0].id } })).endsAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "TENANT_PROPERTY_ENDED", entityId: links[0].id } })).toBe(1);
    await db.tenantProperty.delete({ where: { id: links[0].id } });
  });

  it("creates and triages once under concurrent stale submissions", async () => {
    const createKey = randomUUID();
    ticketId = await createTicket(tenantA, { propertyId: "demo-property-harbour", title: "[integration] full workflow", description: "Water leaks under the kitchen sink since Tuesday.", location: "Kitchen", availability: "Friday morning", idempotencyKey: createKey });
    expect(await createTicket(tenantA, { propertyId: "demo-property-harbour", title: "ignored retry", description: "ignored retry", location: "Kitchen", availability: "Friday", idempotencyKey: createKey })).toBe(ticketId);
    expect(await db.ticketEvent.count({ where: { idempotencyKey: createKey } })).toBe(1);
    const input = { ticketId, expectedVersion: 1, needsInfo: false, title: "Kitchen sink leak", summary: "Water leaks under the kitchen sink.", priority: "HIGH" as const };
    const results = await Promise.allSettled([triageTicket(manager, { ...input, idempotencyKey: randomUUID() }), triageTicket(manager, { ...input, idempotencyKey: randomUUID() })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("revokes the old contractor immediately after reassignment", async () => {
    let ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await assignContractor(manager, { ticketId, contractorId: contractorA.id, expectedVersion: ticket.version, idempotencyKey: randomUUID() });
    ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await assignContractor(manager, { ticketId, contractorId: contractorB.id, expectedVersion: ticket.version, idempotencyKey: randomUUID() });
    ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await expect(submitQuote(contractorA, { ticketId, expectedVersion: ticket.version, amountCents: 10000, scope: "Old assignment", idempotencyKey: randomUUID() })).rejects.toThrow(/not found|current contractor/i);
    await db.outboxJob.deleteMany();
    const staleAssignment = await db.outboxJob.create({ data: { businessKey: `integration-stale-assignment-${randomUUID()}`, kind: "CONTRACTOR_ASSIGNED", payload: { ticketId, contractorId: contractorA.id }, availableAt: new Date(0) } });
    expect(await processOne()).toBe(true);
    expect((await db.outboxJob.findUniqueOrThrow({ where: { id: staleAssignment.id } })).status).toBe("CANCELLED");
  });

  it("does not reveal another tenant's work order through a direct service call", async () => {
    const ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await expect(addTenantInformation(tenantB, { ticketId, expectedVersion: ticket.version, information: "Attempted cross-tenant update", idempotencyKey: randomUUID() })).rejects.toThrow(/not found/i);
  });

  it("keeps internal manager notes hidden while exposing tenant messages", async () => {
    let ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await addManagerNote(manager, { ticketId, expectedVersion: ticket.version, message: "Internal integration note", audience: "INTERNAL", idempotencyKey: randomUUID() });
    ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await addManagerNote(manager, { ticketId, expectedVersion: ticket.version, message: "Tenant integration message", audience: "TENANT", idempotencyKey: randomUUID() });
    const tenantView = await getTicket(tenantA, ticketId);
    expect(tenantView.ticket.events.some((item) => item.message === "Internal integration note")).toBe(false);
    expect(tenantView.ticket.events.some((item) => item.message === "Tenant integration message")).toBe(true);
    expect(await db.outboxJob.count({ where: { kind: "MANAGER_MESSAGE", payload: { path: ["ticketId"], equals: ticketId } } })).toBe(1);
  });

  it("invalidates quote approval on a new revision", async () => {
    let ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await submitQuote(contractorB, { ticketId, expectedVersion: ticket.version, amountCents: 22500, scope: "Replace sink trap", idempotencyKey: randomUUID() });
    ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const quote1 = await db.quote.findFirstOrThrow({ where: { ticketId, version: 1 } });
    await decideQuote(manager, { ticketId, quoteId: quote1.id, expectedVersion: ticket.version, decision: "APPROVED", idempotencyKey: randomUUID() });
    ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await submitQuote(contractorB, { ticketId, expectedVersion: ticket.version, amountCents: 24000, scope: "Replace sink trap and seal", idempotencyKey: randomUUID() });
    const quotes = await db.quote.findMany({ where: { ticketId }, orderBy: { version: "asc" } });
    expect(quotes.map((quote) => quote.status)).toEqual(["SUPERSEDED", "SUBMITTED"]);
  });

  it("cancels a contractor response reminder after the contractor has quoted", async () => {
    await db.outboxJob.deleteMany();
    const reminder = await db.outboxJob.create({ data: { businessKey: `integration-answered-reminder-${randomUUID()}`, kind: "CONTRACTOR_RESPONSE_REMINDER", payload: { ticketId, contractorId: contractorB.id }, availableAt: new Date(0) } });
    expect(await processOne()).toBe(true);
    expect((await db.outboxJob.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe("CANCELLED");
  });

  it("rescheduling creates a new version with no inherited confirmations", async () => {
    let ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const quote2 = await db.quote.findFirstOrThrow({ where: { ticketId, version: 2 } });
    await decideQuote(manager, { ticketId, quoteId: quote2.id, expectedVersion: ticket.version, decision: "APPROVED", idempotencyKey: randomUUID() });
    ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await scheduleAppointment(manager, { ticketId, expectedVersion: ticket.version, startsAt: new Date("2026-11-01T22:00:00Z"), endsAt: new Date("2026-11-01T23:00:00Z"), idempotencyKey: randomUUID() });
    ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    let appointment = await db.appointment.findFirstOrThrow({ where: { ticketId, version: 1 } });
    await confirmAppointment(tenantA, { ticketId, appointmentId: appointment.id, expectedVersion: ticket.version, idempotencyKey: randomUUID() });
    ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await confirmAppointment(contractorB, { ticketId, appointmentId: appointment.id, expectedVersion: ticket.version, idempotencyKey: randomUUID() });
    ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await scheduleAppointment(manager, { ticketId, expectedVersion: ticket.version, startsAt: new Date("2026-11-02T22:00:00Z"), endsAt: new Date("2026-11-02T23:00:00Z"), idempotencyKey: randomUUID() });
    appointment = await db.appointment.findFirstOrThrow({ where: { ticketId, version: 2 } });
    expect(appointment.tenantConfirmedAt).toBeNull();
    expect(appointment.contractorConfirmedAt).toBeNull();
    await db.outboxJob.deleteMany();
    const staleConfirmation = await db.outboxJob.create({ data: { businessKey: `integration-stale-confirmation-${randomUUID()}`, kind: "APPOINTMENT_CONFIRMATION", payload: { ticketId, appointmentVersion: 1 }, availableAt: new Date(0) } });
    expect(await processOne()).toBe(true);
    expect((await db.outboxJob.findUniqueOrThrow({ where: { id: staleConfirmation.id } })).status).toBe("CANCELLED");
  });

  it("reclaims a worker lease after restart and delivers the job once", async () => {
    await db.outboxJob.deleteMany();
    const businessKey = `integration-reclaim-${randomUUID()}`;
    const job = await db.outboxJob.create({ data: { businessKey, kind: "APPOINTMENT_CONFIRMATION", payload: { ticketId, appointmentVersion: 2 }, status: "PROCESSING", attempts: 1, lockedAt: new Date(Date.now() - 120_000), lockedBy: "stopped-worker" } });
    expect(await processOne()).toBe(true);
    expect((await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("SENT");
    expect(await db.notification.count({ where: { businessKey: { startsWith: businessKey } } })).toBe(2);
    expect(await processOne()).toBe(false);
  });

  it("calculates dashboard counts from all visible records, not only the recent page", async () => {
    const ids = Array.from({ length: 6 }, () => `integration-dashboard-${randomUUID()}`);
    await db.ticket.createMany({ data: ids.map((id, index) => ({ id, reference: `RF-INT-${randomUUID()}`, propertyId: "demo-property-harbour", createdById: tenantA.id, title: `[integration] dashboard ${index}`, description: "Count verification", location: "Kitchen", availability: "Any time", aiMissingInfo: [] })) });
    const expected = await db.ticket.count({ where: { status: { notIn: ["CLOSED", "CANCELLED"] } } });
    const dashboard = await getDashboard(manager);
    expect(dashboard.tickets).toHaveLength(8);
    expect(dashboard.counts.open).toBe(expected);
    await db.ticket.deleteMany({ where: { id: { in: ids } } });
  });

  it("cancels a stale reminder instead of delivering it", async () => {
    await db.outboxJob.deleteMany();
    await db.ticket.update({ where: { id: ticketId }, data: { status: "CLOSED" } });
    const job = await db.outboxJob.create({ data: { businessKey: `integration-stale-${randomUUID()}`, kind: "APPOINTMENT_REMINDER", payload: { ticketId, appointmentVersion: 1 }, availableAt: new Date(0) } });
    expect(await processOne()).toBe(true);
    expect((await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CANCELLED");
  });

  afterAll(async () => { if (ticketId) { await db.notification.deleteMany({ where: { ticketId } }); await db.ticket.deleteMany({ where: { id: ticketId } }); } await db.outboxJob.deleteMany(); await db.$disconnect(); });
});
