import "server-only";

import { notFound } from "next/navigation";
import { Prisma, Visibility } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { canAccessTicket, ticketWhereFor } from "@/lib/permissions";
import type { Viewer } from "@/lib/session";
import type { TicketFilters } from "@/lib/ticket-filters";

export async function listTickets(viewer: Viewer, filters: TicketFilters) {
  return db.ticket.findMany({
    where: {
      ...ticketWhereFor(viewer),
      ...(filters.status && filters.status !== "ALL" ? { status: filters.status as never } : {}),
      ...(filters.query ? { OR: [{ reference: { contains: filters.query, mode: "insensitive" } }, { title: { contains: filters.query, mode: "insensitive" } }, { description: { contains: filters.query, mode: "insensitive" } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, reference: true, title: true, status: true, priority: true, updatedAt: true, property: { select: { name: true, suburb: true } }, assignedContractor: { select: { name: true } } },
  });
}

export async function getTicket(viewer: Viewer, ticketId: string) {
  const subject = await db.ticket.findUnique({ where: { id: ticketId }, select: { createdById: true, assignedContractorId: true } });
  if (!subject || !canAccessTicket(viewer, subject)) notFound();
  const eventWhere: Prisma.TicketEventWhereInput = viewer.role === "MANAGER" ? {} : viewer.role === "TENANT" ? { visibility: { in: [Visibility.PARTICIPANTS, Visibility.TENANT] } } : { visibility: { in: [Visibility.PARTICIPANTS, Visibility.CONTRACTOR] } };
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      property: { include: { assets: true } },
      asset: true,
      createdBy: { select: { name: true, email: true } },
      assignedContractor: { select: { id: true, name: true, email: true, contractorProfile: true } },
      events: { where: eventWhere, orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { version: "desc" } },
      appointments: { orderBy: { version: "desc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      aiDrafts: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });
  if (!ticket) notFound();
  const contractors = viewer.role === "MANAGER" ? await db.user.findMany({ where: { role: "CONTRACTOR", active: true, contractorProfile: { active: true, servicePostcodes: { has: ticket.property.postcode } } }, select: { id: true, name: true, contractorProfile: true } }) : [];
  const related = await db.ticket.findMany({ where: { propertyId: ticket.propertyId, id: { not: ticket.id }, OR: [{ location: { equals: ticket.location, mode: "insensitive" } }, { assetId: ticket.assetId ?? "__none__" }] }, take: 4, orderBy: { createdAt: "desc" }, select: { id: true, reference: true, title: true, status: true, createdAt: true } });
  return { ticket, contractors, related };
}

export async function tenantProperties(viewer: Viewer) {
  if (viewer.role === "MANAGER") return db.property.findMany({ orderBy: { name: "asc" } });
  if (viewer.role !== "TENANT") return [];
  const links = await db.tenantProperty.findMany({ where: { tenantId: viewer.id, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, include: { property: true } });
  return links.map((link) => link.property);
}
