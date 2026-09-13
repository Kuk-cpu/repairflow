import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type OutboxJob } from "../generated/prisma/client";
import { sendEmail } from "../adapters/email";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the worker");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
const leaseMs = 60_000;

type Payload = { ticketId?: string; ticketVersion?: number; appointmentVersion?: number; contractorId?: string; message?: string };

async function claimJob() {
  return db.$transaction(async (tx) => {
    const expired = new Date(Date.now() - leaseMs);
    const jobs = await tx.$queryRaw<OutboxJob[]>`
      SELECT * FROM "OutboxJob"
      WHERE "availableAt" <= NOW()
        AND ("status" = 'PENDING' OR ("status" = 'PROCESSING' AND "lockedAt" < ${expired}))
      ORDER BY "availableAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const job = jobs[0];
    if (!job) return null;
    return tx.outboxJob.update({ where: { id: job.id }, data: { status: "PROCESSING", lockedAt: new Date(), lockedBy: workerId, attempts: { increment: 1 } } });
  });
}

async function contextFor(job: OutboxJob) {
  const payload = job.payload as Payload;
  if (!payload.ticketId) return null;
  const ticket = await db.ticket.findUnique({ where: { id: payload.ticketId }, include: { createdBy: true, assignedContractor: true, property: true, appointments: { where: { supersededAt: null }, orderBy: { version: "desc" }, take: 1 } } });
  if (!ticket) return null;
  if (["CLOSED", "CANCELLED"].includes(ticket.status) && job.kind !== "TICKET_CANCELLED") return null;
  if (["CONTRACTOR_ASSIGNED", "CONTRACTOR_RESPONSE_REMINDER"].includes(job.kind) && ticket.assignedContractorId !== payload.contractorId) return null;
  if (job.kind === "CONTRACTOR_RESPONSE_REMINDER") {
    if (ticket.status !== "ASSIGNED") return null;
    const responded = await db.quote.count({ where: { ticketId: ticket.id, submittedById: payload.contractorId } });
    if (responded > 0) return null;
  }
  if (["APPOINTMENT_CONFIRMATION", "APPOINTMENT_REMINDER"].includes(job.kind) && ticket.appointments[0]?.version !== payload.appointmentVersion) return null;
  if (["APPOINTMENT_CONFIRMATION", "APPOINTMENT_REMINDER"].includes(job.kind) && ticket.status !== "SCHEDULED") return null;
  if (job.kind === "PENDING_CONFIRMATION_REMINDER" && ticket.status !== "AWAITING_CONFIRMATION") return null;
  return { payload, ticket };
}

function notificationCopy(kind: string, reference: string) {
  const copy: Record<string, { title: string; body: string }> = {
    TICKET_SUBMITTED: { title: "New maintenance request", body: `${reference} is ready for triage.` },
    TENANT_FOLLOW_UP: { title: "More information needed", body: `${reference} needs more detail before triage.` },
    CONTRACTOR_ASSIGNED: { title: "Work order assigned", body: `${reference} has been assigned.` },
    CONTRACTOR_RESPONSE_REMINDER: { title: "Response reminder", body: `${reference} still needs a contractor response.` },
    QUOTE_SUBMITTED: { title: "Quote ready for review", body: `${reference} has a submitted quote.` },
    QUOTE_APPROVED: { title: "Quote approved", body: `The current quote for ${reference} was approved.` },
    QUOTE_REJECTED: { title: "Quote rejected", body: `The quote for ${reference} was rejected.` },
    QUOTE_REVISION_REQUESTED: { title: "Quote revision requested", body: `${reference} needs a revised quote.` },
    APPOINTMENT_CONFIRMATION: { title: "Confirm appointment", body: `${reference} has a new appointment time.` },
    APPOINTMENT_REMINDER: { title: "Appointment reminder", body: `${reference} has an upcoming appointment.` },
    TENANT_CONFIRMATION: { title: "Confirm repair outcome", body: `${reference} is ready for your confirmation.` },
    PENDING_CONFIRMATION_REMINDER: { title: "Outcome still pending", body: `${reference} is waiting for tenant confirmation.` },
    TICKET_REOPENED: { title: "Work order reopened", body: `${reference} has returned to triage.` },
    TENANT_INFORMATION_ADDED: { title: "Tenant information received", body: `${reference} has new information ready for review.` },
    TICKET_CANCELLED: { title: "Work order cancelled", body: `${reference} has been cancelled.` },
  };
  return copy[kind] ?? { title: "RepairFlow update", body: `${reference} has a new update.` };
}

async function recipients(kind: string, ticket: NonNullable<Awaited<ReturnType<typeof contextFor>>>["ticket"]) {
  if (["TICKET_SUBMITTED", "QUOTE_SUBMITTED", "PENDING_CONFIRMATION_REMINDER", "TICKET_REOPENED", "TENANT_INFORMATION_ADDED"].includes(kind)) {
    return db.user.findMany({ where: { role: "MANAGER", active: true } });
  }
  if (kind === "TICKET_CANCELLED") return [ticket.createdBy, ...(ticket.assignedContractor ? [ticket.assignedContractor] : [])];
  if (["CONTRACTOR_ASSIGNED", "CONTRACTOR_RESPONSE_REMINDER", "QUOTE_APPROVED", "QUOTE_REJECTED", "QUOTE_REVISION_REQUESTED"].includes(kind)) return ticket.assignedContractor ? [ticket.assignedContractor] : [];
  if (kind === "APPOINTMENT_CONFIRMATION") {
    const appointment = ticket.appointments[0];
    return [
      ...(!appointment?.tenantConfirmedAt ? [ticket.createdBy] : []),
      ...(!appointment?.contractorConfirmedAt && ticket.assignedContractor ? [ticket.assignedContractor] : []),
    ];
  }
  if (kind === "APPOINTMENT_REMINDER") return [ticket.createdBy, ...(ticket.assignedContractor ? [ticket.assignedContractor] : [])];
  return [ticket.createdBy];
}

export async function processOne() {
  const job = await claimJob();
  if (!job) return false;
  try {
    const context = await contextFor(job);
    if (!context) {
      await db.outboxJob.update({ where: { id: job.id }, data: { status: "CANCELLED", lockedAt: null, lockedBy: null, lastError: "Stale workflow state" } });
      return true;
    }
    const copy = context.payload.message ? { title: "Message from your property team", body: context.payload.message } : notificationCopy(job.kind, context.ticket.reference);
    const users = await recipients(job.kind, context.ticket);
    for (const user of users) {
      await db.notification.upsert({ where: { businessKey: `${job.businessKey}:in-app:${user.id}` }, create: { businessKey: `${job.businessKey}:in-app:${user.id}`, userId: user.id, ticketId: context.ticket.id, title: copy.title, body: copy.body }, update: {} });
      await sendEmail({ to: user.email, subject: `${copy.title} · ${context.ticket.reference}`, text: `${copy.body}\n\nOpen ${process.env.APP_ORIGIN}/tickets/${context.ticket.id}` });
    }
    await db.outboxJob.update({ where: { id: job.id }, data: { status: "SENT", sentAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown worker error";
    const terminal = job.attempts >= job.maxAttempts;
    const backoff = Math.min(60 * 60_000, 2 ** Math.min(job.attempts, 10) * 1_000);
    await db.outboxJob.update({ where: { id: job.id }, data: { status: terminal ? "FAILED" : "PENDING", availableAt: new Date(Date.now() + backoff), lockedAt: null, lockedBy: null, lastError: message } });
  }
  return true;
}

async function run() {
  const once = process.env.WORKER_ONCE === "true";
  do {
    const processed = await processOne();
    if (once) break;
    if (!processed) await new Promise((resolve) => setTimeout(resolve, 2_000));
  } while (true);
}

if (import.meta.url === `file://${process.argv[1]}`) run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
