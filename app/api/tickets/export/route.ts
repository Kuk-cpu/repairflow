import { db } from "@/lib/db";
import { ticketWhereFor } from "@/lib/permissions";
import { viewerFromHeaders } from "@/lib/route-auth";

function csv(value: string | number | null) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  const viewer = await viewerFromHeaders(request.headers);
  if (!viewer) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const tickets = await db.ticket.findMany({
    where: ticketWhereFor(viewer),
    orderBy: { updatedAt: "desc" },
    select: { reference: true, title: true, status: true, priority: true, location: true, updatedAt: true, property: { select: { name: true } }, assignedContractor: { select: { name: true } } },
  });
  const rows = [
    ["Reference", "Title", "Status", "Priority", "Property", "Location", "Contractor", "Updated UTC"],
    ...tickets.map((ticket) => [ticket.reference, ticket.title, ticket.status, ticket.priority, ticket.property.name, ticket.location, ticket.assignedContractor?.name ?? "", ticket.updatedAt.toISOString()]),
  ];
  const body = rows.map((row) => row.map(csv).join(",")).join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=repairflow-work-orders.csv", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
