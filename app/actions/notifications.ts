"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";

export async function markAllNotificationsReadAction() {
  const viewer = await requireViewer();
  await db.notification.updateMany({ where: { userId: viewer.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
