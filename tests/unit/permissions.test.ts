import { describe, expect, it } from "vitest";
import { canAccessTicket } from "@/lib/permissions";

const ticket = { createdById: "tenant-a", assignedContractorId: "contractor-a" };

describe("record-level ticket authorization", () => {
  it("isolates tenants", () => { expect(canAccessTicket({ id: "tenant-a", role: "TENANT" }, ticket)).toBe(true); expect(canAccessTicket({ id: "tenant-b", role: "TENANT" }, ticket)).toBe(false); });
  it("isolates contractors", () => { expect(canAccessTicket({ id: "contractor-a", role: "CONTRACTOR" }, ticket)).toBe(true); expect(canAccessTicket({ id: "old-contractor", role: "CONTRACTOR" }, ticket)).toBe(false); });
  it("allows managers", () => expect(canAccessTicket({ id: "manager", role: "MANAGER" }, ticket)).toBe(true));
});
