import { z } from "zod";

export const evidenceSchema = z.object({ field: z.enum(["summary", "location", "timeMention"]), quote: z.string().max(240) });
export const extractionSchema = z.object({
  summary: z.string().min(1).max(500),
  location: z.string().max(120).nullable(),
  timeMention: z.string().max(160).nullable(),
  missingInfo: z.array(z.string().max(180)).max(8),
  evidence: z.array(evidenceSchema).max(8),
});
export const messageDraftSchema = z.object({ message: z.string().min(1).max(1200) });
export const operationsSummarySchema = z.object({ headline: z.string().max(180), items: z.array(z.object({ ticketId: z.string(), note: z.string().max(300) })).max(8) });

export type Extraction = z.infer<typeof extractionSchema>;
export type MessageDraft = z.infer<typeof messageDraftSchema>;
export type OperationsSummary = z.infer<typeof operationsSummarySchema>;
