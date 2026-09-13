"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/session";
import { approveTicketAiDraft, createTicketAiDraft } from "@/services/ai-service";

function actionError(error: unknown, fallback: string) { unstable_rethrow(error); return error instanceof Error ? error.message : fallback; }

export async function generateTicketAiDraftAction(formData: FormData) {
  const viewer = await requireViewer();
  const input = z.object({ ticketId: z.string().min(3), kind: z.enum(["EXTRACTION", "FOLLOW_UP", "PROGRESS"]) }).parse(Object.fromEntries(formData));
  try { await createTicketAiDraft(viewer, input); revalidatePath(`/tickets/${input.ticketId}`); redirect(`/tickets/${input.ticketId}?success=${encodeURIComponent("Editable AI draft created")}&nonce=${randomUUID()}`); }
  catch (error) { redirect(`/tickets/${input.ticketId}?error=${encodeURIComponent(actionError(error, "AI draft failed; continue manually"))}`); }
}

export async function approveTicketAiDraftAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  const input = z.object({ ticketId: z.string().min(3), draftId: z.string().min(3), expectedVersion: z.coerce.number().int().positive(), summary: z.string().trim().max(500).optional(), location: z.string().trim().max(120).optional(), timeMention: z.string().trim().max(160).optional(), missingInfo: z.string().trim().max(1000).optional(), message: z.string().trim().max(1200).optional() }).parse(Object.fromEntries(formData));
  try { await approveTicketAiDraft(viewer, input); revalidatePath(`/tickets/${input.ticketId}`); redirect(`/tickets/${input.ticketId}?success=${encodeURIComponent(input.message ? "Draft reviewed and sent" : "Edited intake draft approved")}`); }
  catch (error) { redirect(`/tickets/${input.ticketId}?error=${encodeURIComponent(actionError(error, "Draft approval failed"))}`); }
}
