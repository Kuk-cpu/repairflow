import { describe, expect, it } from "vitest";
import { assertTransition, hasStartPrerequisites, nextOwner, WorkflowError } from "@/domain/workflow";
import { audToCents, formatAud } from "@/domain/money";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

describe("ticket workflow", () => {
  it("rejects skipped transitions", () => expect(() => assertTransition("SUBMITTED", "IN_PROGRESS", "MANAGER")).toThrow(WorkflowError));
  it("lets only the contractor start scheduled work", () => {
    expect(() => assertTransition("SCHEDULED", "IN_PROGRESS", "CONTRACTOR")).not.toThrow();
    expect(() => assertTransition("SCHEDULED", "IN_PROGRESS", "TENANT")).toThrow(/cannot perform/);
  });
  it("allows tenant cancellation only before assignment", () => {
    expect(() => assertTransition("SUBMITTED", "CANCELLED", "TENANT")).not.toThrow();
    expect(() => assertTransition("TRIAGED", "CANCELLED", "TENANT")).toThrow(/cannot perform/);
    expect(() => assertTransition("TRIAGED", "CANCELLED", "MANAGER")).not.toThrow();
  });
  it("allows the requesting tenant to reopen a closed repair", () => {
    expect(() => assertTransition("CLOSED", "TRIAGED", "TENANT")).not.toThrow();
  });
  it("requires quote and both confirmations", () => {
    expect(hasStartPrerequisites({ approvedQuote: true, quoteWaived: false, tenantConfirmed: true, contractorConfirmed: true })).toBe(true);
    expect(hasStartPrerequisites({ approvedQuote: true, quoteWaived: false, tenantConfirmed: true, contractorConfirmed: false })).toBe(false);
    expect(hasStartPrerequisites({ approvedQuote: false, quoteWaived: false, tenantConfirmed: true, contractorConfirmed: true })).toBe(false);
  });
  it("identifies the participant responsible for the next action", () => {
    expect(nextOwner("NEEDS_INFO")).toBe("Tenant");
    expect(nextOwner("ASSIGNED")).toBe("Contractor");
    expect(nextOwner("ASSIGNED", { latestQuoteStatus: "SUBMITTED" })).toBe("Property manager");
    expect(nextOwner("SCHEDULED", { tenantConfirmed: true, contractorConfirmed: false })).toBe("Contractor");
    expect(nextOwner("SCHEDULED", { tenantConfirmed: true, contractorConfirmed: true })).toBe("Contractor");
  });
});

describe("deterministic calculations", () => {
  it("stores AUD as integer cents", () => { expect(audToCents("289.50")).toBe(28950); expect(formatAud(28950)).toContain("289.50"); });
  it("rejects fractional cents and formatted input", () => { expect(() => audToCents("1.999")).toThrow(); expect(() => audToCents("1,000")).toThrow(); });
  it("handles Sydney daylight saving offsets", () => {
    const summer = fromZonedTime("2026-01-15T09:00", "Australia/Sydney");
    const winter = fromZonedTime("2026-07-15T09:00", "Australia/Sydney");
    expect(summer.toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect(winter.toISOString()).toBe("2026-07-14T23:00:00.000Z");
    expect(formatInTimeZone(summer, "Australia/Sydney", "HH:mm")).toBe("09:00");
  });
});
