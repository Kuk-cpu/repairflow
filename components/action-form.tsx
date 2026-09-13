import { randomUUID } from "node:crypto";

export function ActionFields({ ticketId, version }: { ticketId: string; version: number }) {
  return <><input type="hidden" name="ticketId" value={ticketId} /><input type="hidden" name="expectedVersion" value={version} /><input type="hidden" name="idempotencyKey" value={randomUUID()} /></>;
}
