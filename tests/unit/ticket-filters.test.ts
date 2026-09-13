import { describe, expect, it } from "vitest";
import { ticketFilterSchema } from "@/lib/ticket-filters";

describe("ticket filters", () => {
  it("accepts supported statuses and trims bounded searches", () => {
    expect(ticketFilterSchema.parse({ status: "ASSIGNED", query: "  kitchen leak  " })).toEqual({ status: "ASSIGNED", query: "kitchen leak" });
  });

  it("rejects unknown statuses and oversized searches", () => {
    expect(ticketFilterSchema.safeParse({ status: "DROP_TABLE" }).success).toBe(false);
    expect(ticketFilterSchema.safeParse({ query: "x".repeat(161) }).success).toBe(false);
  });
});
