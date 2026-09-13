import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { canAccessTicket } from "@/lib/permissions";
import { assertSameOrigin } from "@/lib/request-security";
import { viewerFromHeaders } from "@/lib/route-auth";
import type { IdRouteContext } from "@/lib/route-context";

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest, context: IdRouteContext) {
  const viewer = await viewerFromHeaders(request.headers);
  if (!viewer) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try { assertSameOrigin(request); } catch { return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 }); }
  const { id } = await context.params;
  const ticket = await db.ticket.findUnique({ where: { id }, select: { id: true, createdById: true, assignedContractorId: true, version: true } });
  if (!ticket || !canAccessTicket(viewer, ticket)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 5_242_880);
  if (file.size < 1 || file.size > maxBytes) return NextResponse.json({ error: "FILE_SIZE_REJECTED" }, { status: 413 });
  const input = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(input);
  if (!detected || !allowed.has(detected.mime)) return NextResponse.json({ error: "FILE_TYPE_REJECTED" }, { status: 415 });
  let output: Buffer;
  try { output = await sharp(input, { failOn: "warning" }).rotate().resize({ width: 4000, height: 4000, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer(); }
  catch { return NextResponse.json({ error: "INVALID_IMAGE" }, { status: 415 }); }
  const storageKey = `${randomUUID()}.webp`;
  const uploadDir = path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? ".data/uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ uploadDir, storageKey), output, { flag: "wx" });
  await db.$transaction(async (tx) => {
    await tx.attachment.create({ data: { ticketId: ticket.id, uploadedById: viewer.id, storageKey, originalName: path.basename(file.name).slice(0, 180), mimeType: "image/webp", byteSize: output.length, sha256: createHash("sha256").update(output).digest("hex") } });
    await tx.ticketEvent.create({ data: { ticketId: ticket.id, actorId: viewer.id, type: "ATTACHMENT_ADDED", message: "Photo attached", visibility: "PARTICIPANTS", ticketVersion: ticket.version } });
    await tx.auditLog.create({ data: { actorId: viewer.id, action: "ATTACHMENT_ADDED", entityType: "Ticket", entityId: ticket.id, outcome: "SUCCESS" } });
  });
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/tickets/${ticket.id}?success=${encodeURIComponent("Photo uploaded")}`,
    },
  });
}
