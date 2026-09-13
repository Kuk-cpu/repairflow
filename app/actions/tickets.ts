"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { requireViewer } from "@/lib/session";
import { addManagerNote, addTenantInformation, assignContractor, cancelTicket, closeTicket, completeWork, confirmAppointment, createTicket, decideQuote, reopenTicket, scheduleAppointment, startWork, submitQuote, triageTicket, waiveQuote } from "@/services/ticket-service";
import { audToCents } from "@/domain/money";

const id = z.string().min(3).max(100);
const version = z.coerce.number().int().positive();
const text = z.string().trim().min(2).max(4000);

function value(formData: FormData, key: string) { return formData.get(key); }
function actionError(error: unknown) { unstable_rethrow(error); return error instanceof Error ? error.message.slice(0, 180) : "The action could not be completed."; }
function finish(ticketId: string, message: string) { revalidatePath("/dashboard"); revalidatePath("/tickets"); revalidatePath(`/tickets/${ticketId}`); redirect(`/tickets/${ticketId}?success=${encodeURIComponent(message)}`); }
function fail(ticketId: string, error: unknown): never { redirect(`/tickets/${ticketId}?error=${encodeURIComponent(actionError(error))}`); }

export async function createTicketAction(formData: FormData) {
  const viewer = await requireViewer(["TENANT", "MANAGER"]);
  const parsed = z.object({ propertyId: id, assetId: z.string().trim().max(100).optional(), title: text.max(120), description: text, location: text.max(120), availability: text.max(500), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try {
    const ticketId = await createTicket(viewer, { ...parsed, assetId: parsed.assetId || undefined });
    revalidatePath("/dashboard");
    redirect(`/tickets/${ticketId}?success=${encodeURIComponent("Request submitted")}`);
  } catch (error) {
    redirect(`/submit?error=${encodeURIComponent(actionError(error))}`);
  }
}

export async function triageTicketAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, title: text.max(120), summary: text.max(500), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]), idempotencyKey: id }).parse(Object.fromEntries(formData));
  const needsInfo = value(formData, "needsInfo") === "on";
  try { await triageTicket(viewer, { ...parsed, needsInfo }); finish(parsed.ticketId, needsInfo ? "Information requested" : "Triage confirmed"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function assignContractorAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  const parsed = z.object({ ticketId: id, contractorId: id, expectedVersion: version, idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await assignContractor(viewer, parsed); finish(parsed.ticketId, "Contractor assigned"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function submitQuoteAction(formData: FormData) {
  const viewer = await requireViewer(["CONTRACTOR"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, amount: z.string(), scope: text.max(2000), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await submitQuote(viewer, { ...parsed, amountCents: audToCents(parsed.amount) }); finish(parsed.ticketId, "Quote submitted"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function decideQuoteAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  const parsed = z.object({ ticketId: id, quoteId: id, expectedVersion: version, decision: z.enum(["APPROVED", "REJECTED", "REVISION_REQUESTED"]), response: z.string().trim().max(1000).optional(), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await decideQuote(viewer, parsed); finish(parsed.ticketId, `Quote ${parsed.decision.toLowerCase().replaceAll("_", " ")}`); } catch (error) { fail(parsed.ticketId, error); }
}

export async function waiveQuoteAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, reason: text.max(500), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await waiveQuote(viewer, parsed); finish(parsed.ticketId, "Quote requirement waived"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function scheduleAppointmentAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, startsAt: z.string().min(10), endsAt: z.string().min(10), notes: z.string().trim().max(500).optional(), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try {
    await scheduleAppointment(viewer, { ...parsed, startsAt: fromZonedTime(parsed.startsAt, "Australia/Sydney"), endsAt: fromZonedTime(parsed.endsAt, "Australia/Sydney") });
    finish(parsed.ticketId, "Appointment saved; confirmations reset");
  } catch (error) { fail(parsed.ticketId, error); }
}

export async function confirmAppointmentAction(formData: FormData) {
  const viewer = await requireViewer(["TENANT", "CONTRACTOR"]);
  const parsed = z.object({ ticketId: id, appointmentId: id, expectedVersion: version, idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await confirmAppointment(viewer, parsed); finish(parsed.ticketId, "Appointment confirmed"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function startWorkAction(formData: FormData) {
  const viewer = await requireViewer(["CONTRACTOR"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await startWork(viewer, parsed); finish(parsed.ticketId, "Work started"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function completeWorkAction(formData: FormData) {
  const viewer = await requireViewer(["CONTRACTOR"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, notes: text.max(4000), actualCost: z.string().optional(), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await completeWork(viewer, { ...parsed, actualCostCents: parsed.actualCost ? audToCents(parsed.actualCost) : undefined }); finish(parsed.ticketId, "Completion sent to tenant"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function closeTicketAction(formData: FormData) {
  const viewer = await requireViewer(["TENANT", "MANAGER"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, reason: z.string().trim().max(1000).optional(), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await closeTicket(viewer, parsed); finish(parsed.ticketId, "Work order closed"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function reopenTicketAction(formData: FormData) {
  const viewer = await requireViewer(["TENANT", "MANAGER"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, reason: text.max(1000), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await reopenTicket(viewer, parsed); finish(parsed.ticketId, "Work order reopened"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function addTenantInformationAction(formData: FormData) {
  const viewer = await requireViewer(["TENANT"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, information: text.max(4000), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await addTenantInformation(viewer, parsed); finish(parsed.ticketId, "Information added for the property team"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function cancelTicketAction(formData: FormData) {
  const viewer = await requireViewer(["TENANT", "MANAGER"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, reason: text.max(1000), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await cancelTicket(viewer, parsed); finish(parsed.ticketId, "Work order cancelled"); } catch (error) { fail(parsed.ticketId, error); }
}

export async function addManagerNoteAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  const parsed = z.object({ ticketId: id, expectedVersion: version, message: text.max(2000), audience: z.enum(["INTERNAL", "TENANT"]), idempotencyKey: id }).parse(Object.fromEntries(formData));
  try { await addManagerNote(viewer, parsed); finish(parsed.ticketId, parsed.audience === "INTERNAL" ? "Internal note added" : "Tenant message queued"); } catch (error) { fail(parsed.ticketId, error); }
}
