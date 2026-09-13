import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessTicket } from "@/lib/permissions";
import { viewerFromHeaders } from "@/lib/route-auth";
import type { IdRouteContext } from "@/lib/route-context";

export async function GET(request: NextRequest, context: IdRouteContext) {
  const viewer = await viewerFromHeaders(request.headers);
  if (!viewer) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const attachment = await db.attachment.findUnique({ where: { id }, include: { ticket: { select: { createdById: true, assignedContractorId: true } } } });
  if (!attachment || !canAccessTicket(viewer, attachment.ticket)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const uploadDir = path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? ".data/uploads");
  const absolutePath = path.join(/* turbopackIgnore: true */ uploadDir, attachment.storageKey);
  if (!absolutePath.startsWith(`${uploadDir}${path.sep}`)) return NextResponse.json({ error: "INVALID_STORAGE_KEY" }, { status: 500 });
  try {
    const bytes = await readFile(/* turbopackIgnore: true */ absolutePath);
    return new NextResponse(bytes, { headers: { "Content-Type": attachment.mimeType, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`, "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "FILE_NOT_FOUND" }, { status: 404 }); }
}
