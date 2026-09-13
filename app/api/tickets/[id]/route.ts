import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessTicket } from "@/lib/permissions";
import { viewerFromHeaders } from "@/lib/route-auth";

export async function GET(request: NextRequest, context: RouteContext<"/api/tickets/[id]">) {
  const viewer = await viewerFromHeaders(request.headers);
  if (!viewer) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const ticket = await db.ticket.findUnique({ where: { id }, select: { id: true, reference: true, title: true, description: true, location: true, availability: true, status: true, priority: true, version: true, createdById: true, assignedContractorId: true, property: { select: { name: true, addressLine: true, suburb: true, postcode: true } } } });
  if (!ticket || !canAccessTicket(viewer, ticket)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ticket: { id: ticket.id, reference: ticket.reference, title: ticket.title, description: ticket.description, location: ticket.location, availability: ticket.availability, status: ticket.status, priority: ticket.priority, version: ticket.version, property: ticket.property } });
}
