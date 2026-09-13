import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type AppRole } from "@/lib/auth";

export type Viewer = { id: string; name: string; email: string; role: AppRole; active: boolean };

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user as typeof session.user & { role: AppRole; active: boolean };
  if (!user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
});

export async function requireViewer(roles?: AppRole[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (roles && !roles.includes(viewer.role)) redirect("/dashboard");
  return viewer;
}
