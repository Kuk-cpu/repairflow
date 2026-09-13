import { z } from "zod";

export const ticketFilterSchema = z.object({
  status: z.enum(["ALL", "SUBMITTED", "NEEDS_INFO", "TRIAGED", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "AWAITING_CONFIRMATION", "CLOSED", "CANCELLED"]).optional(),
  query: z.string().trim().max(160).optional(),
});

export type TicketFilters = z.infer<typeof ticketFilterSchema>;
