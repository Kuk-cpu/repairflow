import "server-only";

import { db } from "@/lib/db";
import { ticketWhereFor } from "@/lib/permissions";
import type { Viewer } from "@/lib/session";

export async function getDashboard(viewer: Viewer) {
  const scope = ticketWhereFor(viewer);
  const [tickets, unreadNotifications, totalProperties, open, unassigned, quoteReview, waiting] = await Promise.all([
    db.ticket.findMany({
      where: scope,
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, reference: true, title: true, status: true, priority: true, updatedAt: true, property: { select: { name: true, suburb: true } }, assignedContractor: { select: { name: true } }, quotes: { where: { status: "SUBMITTED" }, select: { id: true } } },
    }),
    db.notification.count({ where: { userId: viewer.id, readAt: null } }),
    viewer.role === "MANAGER" ? db.property.count() : Promise.resolve(0),
    db.ticket.count({ where: { ...scope, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
    db.ticket.count({ where: { ...scope, status: { in: ["SUBMITTED", "NEEDS_INFO", "TRIAGED"] } } }),
    db.ticket.count({ where: { ...scope, quotes: { some: { status: "SUBMITTED" } } } }),
    db.ticket.count({ where: { ...scope, status: { in: ["SCHEDULED", "AWAITING_CONFIRMATION"] } } }),
  ]);
  const counts = { open, unassigned, quoteReview, waiting };
  return { tickets, counts, unreadNotifications, totalProperties };
}
