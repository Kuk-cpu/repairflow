import { extractionSchema, messageDraftSchema, operationsSummarySchema, type Extraction, type MessageDraft, type OperationsSummary } from "@/ai/schema";

const rooms = ["kitchen", "bathroom", "bedroom", "laundry", "balcony", "garage", "hallway", "living room"];
const timePatterns = [/since\s+(?:last\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|today|this morning|this evening)/i, /for\s+the\s+(?:past|last)\s+[^,.]{1,40}/i, /at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)/i, /\b(?:tomorrow|next week|this weekend)\b/i];
const injection = /ignore (?:all |any )?(?:previous|above)|system prompt|reveal|other (?:tickets|tenants)|execute|run (?:a )?(?:command|tool)|send (?:an )?email/i;

export function demoExtract(description: string): Extraction {
  const clean = description.replace(/\s+/g, " ").trim().slice(0, 4000);
  const unsafeInstruction = injection.test(clean);
  const location = rooms.find((room) => clean.toLowerCase().includes(room)) ?? null;
  const timeMention = timePatterns.map((pattern) => clean.match(pattern)?.[0] ?? null).find(Boolean) ?? null;
  const firstSentence = unsafeInstruction ? "No observable maintenance issue was provided." : clean.split(/(?<=[.!?])\s/)[0]?.slice(0, 500) || "No observable maintenance issue was provided.";
  const missingInfo: string[] = [];
  if (!timeMention) missingInfo.push("When the issue started");
  if (unsafeInstruction || !/water|smoke|spark|smell|noise|leak|damage|working|broken|blocked|temperature|drip|crack|mould|heat/i.test(clean)) missingInfo.push("Observable symptoms or impact");
  return extractionSchema.parse({
    summary: firstSentence,
    location,
    timeMention,
    missingInfo,
    evidence: [
      ...(unsafeInstruction ? [] : [{ field: "summary" as const, quote: firstSentence }]),
      ...(location ? [{ field: "location" as const, quote: clean.match(new RegExp(`[^.!?]{0,60}${location}[^.!?]{0,60}`, "i"))?.[0]?.trim() ?? location }] : []),
      ...(timeMention ? [{ field: "timeMention" as const, quote: timeMention }] : []),
    ],
  });
}

export async function demoMessage(input: { description: string; purpose: "follow_up" | "progress" }): Promise<MessageDraft> {
  const extraction = demoExtract(input.description);
  const message = input.purpose === "follow_up"
    ? `Thanks for reporting this. Before we arrange the next step, could you please confirm ${extraction.missingInfo.length ? extraction.missingInfo.join(" and ").toLowerCase() : "whether anything has changed since your report"}? Please contact the emergency number shown in RepairFlow if anyone is in immediate danger.`
    : "Your maintenance request is moving through the current workflow. We will confirm the next responsible person and any appointment details in RepairFlow.";
  return messageDraftSchema.parse({ message });
}

export async function demoSummary(input: Array<{ ticketId: string; reference: string; title: string; status: string }>): Promise<OperationsSummary> {
  const open = input.filter((ticket) => !["CLOSED", "CANCELLED"].includes(ticket.status));
  return operationsSummarySchema.parse({ headline: `${open.length} visible work orders need continued attention.`, items: open.slice(0, 8).map((ticket) => ({ ticketId: ticket.ticketId, note: `${ticket.reference}: ${ticket.title} is ${ticket.status.toLowerCase().replaceAll("_", " ")}.` })) });
}
