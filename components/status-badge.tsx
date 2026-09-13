const labels: Record<string, string> = { SUBMITTED: "Submitted", NEEDS_INFO: "Needs info", TRIAGED: "Triaged", ASSIGNED: "Assigned", SCHEDULED: "Scheduled", IN_PROGRESS: "In progress", AWAITING_CONFIRMATION: "Awaiting confirmation", CLOSED: "Closed", CANCELLED: "Cancelled", REVISION_REQUESTED: "Revision requested", APPROVED: "Approved", REJECTED: "Rejected", SUPERSEDED: "Superseded" };

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status status-${status.toLowerCase()}`}>{labels[status] ?? status}</span>;
}
