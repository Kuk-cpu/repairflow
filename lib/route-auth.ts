import "server-only";

import { auth, type AppRole } from "@/lib/auth";
import type { Viewer } from "@/lib/session";

export async function viewerFromHeaders(headers: Headers): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const user = session.user as typeof session.user & { role: AppRole; active: boolean };
  if (!user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
}
