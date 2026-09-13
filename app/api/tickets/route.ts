import { NextResponse, type NextRequest } from "next/server";
import { listTickets } from "@/data/tickets";
import { viewerFromHeaders } from "@/lib/route-auth";
import { ticketFilterSchema } from "@/lib/ticket-filters";

export async function GET(request: NextRequest) {
  const viewer = await viewerFromHeaders(request.headers);
  if (!viewer) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const filters = ticketFilterSchema.safeParse({ status: request.nextUrl.searchParams.get("status") ?? undefined, query: request.nextUrl.searchParams.get("query") ?? undefined });
  if (!filters.success) return NextResponse.json({ error: "INVALID_FILTERS" }, { status: 400 });
  const tickets = await listTickets(viewer, filters.data);
  return NextResponse.json({ tickets });
}
