import type { AppRole } from "@/lib/auth";

export type TicketAccessSubject = { createdById: string; assignedContractorId: string | null };

export function canAccessTicket(viewer: { id: string; role: AppRole }, ticket: TicketAccessSubject): boolean {
  if (viewer.role === "MANAGER") return true;
  if (viewer.role === "TENANT") return ticket.createdById === viewer.id;
  return ticket.assignedContractorId === viewer.id;
}

export function ticketWhereFor(viewer: { id: string; role: AppRole }) {
  if (viewer.role === "MANAGER") return {};
  if (viewer.role === "TENANT") return { createdById: viewer.id };
  return { assignedContractorId: viewer.id };
}
