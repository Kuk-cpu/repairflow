import type { AppRole } from "@/lib/auth";

export type WorkflowStatus = "SUBMITTED" | "NEEDS_INFO" | "TRIAGED" | "ASSIGNED" | "SCHEDULED" | "IN_PROGRESS" | "AWAITING_CONFIRMATION" | "CLOSED" | "CANCELLED";

const allowed: Record<WorkflowStatus, WorkflowStatus[]> = {
  SUBMITTED: ["NEEDS_INFO", "TRIAGED", "CANCELLED"],
  NEEDS_INFO: ["TRIAGED", "CANCELLED"],
  TRIAGED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["ASSIGNED", "SCHEDULED", "CANCELLED"],
  SCHEDULED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["AWAITING_CONFIRMATION", "CANCELLED"],
  AWAITING_CONFIRMATION: ["CLOSED", "TRIAGED", "CANCELLED"],
  CLOSED: ["TRIAGED"],
  CANCELLED: ["TRIAGED"],
};

export class WorkflowError extends Error {
  constructor(message: string, public readonly code = "WORKFLOW_REJECTED", public readonly status = 409) {
    super(message);
  }
}

export function assertTransition(from: WorkflowStatus, to: WorkflowStatus, role: AppRole) {
  if (!allowed[from].includes(to)) throw new WorkflowError(`Transition from ${from} to ${to} is not allowed.`);
  if (role !== "MANAGER") {
    const tenantAllowed = (from === "AWAITING_CONFIRMATION" && ["CLOSED", "TRIAGED"].includes(to)) || (from === "CLOSED" && to === "TRIAGED") || (from === "SUBMITTED" && to === "CANCELLED");
    const contractorAllowed = (from === "SCHEDULED" && to === "IN_PROGRESS") || (from === "IN_PROGRESS" && to === "AWAITING_CONFIRMATION");
    if ((role === "TENANT" && !tenantAllowed) || (role === "CONTRACTOR" && !contractorAllowed)) {
      throw new WorkflowError(`${role} cannot perform this transition.`, "FORBIDDEN", 403);
    }
  }
}

export function hasStartPrerequisites(input: { approvedQuote: boolean; quoteWaived: boolean; tenantConfirmed: boolean; contractorConfirmed: boolean }) {
  return (input.approvedQuote || input.quoteWaived) && input.tenantConfirmed && input.contractorConfirmed;
}

export function nextOwner(status: WorkflowStatus, context: { latestQuoteStatus?: string; quoteWaived?: boolean; tenantConfirmed?: boolean; contractorConfirmed?: boolean } = {}) {
  if (["SUBMITTED", "TRIAGED"].includes(status)) return "Property manager";
  if (status === "NEEDS_INFO") return "Tenant";
  if (status === "ASSIGNED") return context.latestQuoteStatus === "SUBMITTED" || context.latestQuoteStatus === "APPROVED" || context.quoteWaived ? "Property manager" : "Contractor";
  if (status === "SCHEDULED") {
    const waiting = [...(!context.tenantConfirmed ? ["Tenant"] : []), ...(!context.contractorConfirmed ? ["Contractor"] : [])];
    return waiting.length ? waiting.join(" and ") : "Contractor";
  }
  if (status === "IN_PROGRESS") return "Contractor";
  if (status === "AWAITING_CONFIRMATION") return "Tenant";
  return "No action required";
}
