import Link from "next/link";
import { ArrowUpRight, CalendarClock, CircleDollarSign, ClipboardPlus, Clock3, Wrench } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { getDashboard } from "@/data/dashboard";
import { requireViewer } from "@/lib/session";
import { OperationsSummary } from "@/components/operations-summary";

function formatDate(value: Date) { return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }).format(value); }

export default async function DashboardPage() {
  const viewer = await requireViewer();
  const data = await getDashboard(viewer);
  const title = viewer.role === "MANAGER" ? "Maintenance overview" : viewer.role === "TENANT" ? "Your maintenance requests" : "Assigned work";
  const subtitle = viewer.role === "MANAGER" ? "Priorities across your portfolio, updated from live work orders." : "See what needs attention and what happens next.";
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">RepairFlow operations</p><h1>{title}</h1><p>{subtitle}</p></div><Link className="button button-primary" href={viewer.role === "TENANT" ? "/submit" : "/tickets"}><ClipboardPlus aria-hidden="true" />{viewer.role === "TENANT" ? "New request" : "Open work orders"}</Link></header>
      <section className="metric-grid" aria-label="Work order summary">
        <article><span className="metric-icon teal"><Wrench aria-hidden="true" /></span><div><small>Open work orders</small><strong>{data.counts.open}</strong><span>Across visible properties</span></div></article>
        <article><span className="metric-icon amber"><Clock3 aria-hidden="true" /></span><div><small>Needs assignment</small><strong>{data.counts.unassigned}</strong><span>Manager action required</span></div></article>
        <article><span className="metric-icon blue"><CircleDollarSign aria-hidden="true" /></span><div><small>Quote review</small><strong>{data.counts.quoteReview}</strong><span>Submitted versions</span></div></article>
        <article><span className="metric-icon coral"><CalendarClock aria-hidden="true" /></span><div><small>Waiting on reply</small><strong>{data.counts.waiting}</strong><span>Confirmations and outcomes</span></div></article>
      </section>
      <section className="work-section">
        <div className="section-heading"><div><h2>Recent work orders</h2><p>Sorted by the latest activity.</p></div><Link href="/tickets">View all <ArrowUpRight aria-hidden="true" /></Link></div>
        <div className="ticket-list">
          {data.tickets.length ? data.tickets.map((ticket) => <Link className="ticket-row" href={`/tickets/${ticket.id}`} key={ticket.id}><span className={`priority priority-${ticket.priority.toLowerCase()}`} aria-label={`${ticket.priority.toLowerCase()} priority`} /><span className="ticket-main"><strong>{ticket.title}</strong><small>{ticket.reference} · {ticket.property.name}, {ticket.property.suburb}</small></span><StatusBadge status={ticket.status} /><span className="ticket-owner"><small>Owner</small><strong>{ticket.assignedContractor?.name ?? "Unassigned"}</strong></span><time dateTime={ticket.updatedAt.toISOString()}>{formatDate(ticket.updatedAt)}</time><ArrowUpRight className="row-arrow" aria-hidden="true" /></Link>) : <div className="empty-state"><Wrench aria-hidden="true" /><h3>No work orders yet</h3><p>New requests will appear here.</p></div>}
        </div>
      </section>
      <OperationsSummary />
    </>
  );
}
