import Link from "next/link";
import { Download, Search, Wrench } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { listTickets } from "@/data/tickets";
import { requireViewer } from "@/lib/session";
import { ticketFilterSchema } from "@/lib/ticket-filters";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ status?: string; query?: string }> }) {
  const viewer = await requireViewer();
  const parsedFilters = ticketFilterSchema.safeParse(await searchParams);
  const filters = parsedFilters.success ? parsedFilters.data : {};
  const tickets = await listTickets(viewer, filters);
  return <>
    <header className="page-heading"><div><p className="eyebrow">Operations</p><h1>{viewer.role === "TENANT" ? "My repairs" : viewer.role === "CONTRACTOR" ? "Assigned work" : "Work orders"}</h1><p>{tickets.length} visible work order{tickets.length === 1 ? "" : "s"}</p></div><div className="page-heading-actions"><Link className="button button-secondary" href="/api/tickets/export"><Download aria-hidden="true" />Export CSV</Link>{viewer.role === "TENANT" ? <Link className="button button-primary" href="/submit"><Wrench aria-hidden="true" />New request</Link> : null}</div></header>
    <form className="filter-bar"><label className="search-field"><Search aria-hidden="true" /><input name="query" defaultValue={filters.query} placeholder="Search reference, title or description" aria-label="Search work orders" /></label><select name="status" defaultValue={filters.status ?? "ALL"} aria-label="Filter by status"><option value="ALL">All statuses</option>{["SUBMITTED","NEEDS_INFO","TRIAGED","ASSIGNED","SCHEDULED","IN_PROGRESS","AWAITING_CONFIRMATION","CLOSED","CANCELLED"].map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select><button className="button button-secondary" type="submit">Apply</button></form>
    <section className="ticket-list">{tickets.length ? tickets.map((ticket) => <Link className="ticket-row" href={`/tickets/${ticket.id}`} key={ticket.id}><span className={`priority priority-${ticket.priority.toLowerCase()}`} /><span className="ticket-main"><strong>{ticket.title}</strong><small>{ticket.reference} · {ticket.property.name}, {ticket.property.suburb}</small></span><StatusBadge status={ticket.status} /><span className="ticket-owner"><small>Owner</small><strong>{ticket.assignedContractor?.name ?? "Unassigned"}</strong></span><time>{new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }).format(ticket.updatedAt)}</time><span /></Link>) : <div className="empty-state"><Wrench aria-hidden="true" /><h3>No matching work orders</h3><p>Adjust the search or status filter.</p></div>}</section>
  </>;
}
