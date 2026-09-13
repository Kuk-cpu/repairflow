import { createHash } from "node:crypto";
import { ShieldCheck, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import { acceptInvitationAction } from "@/app/actions/admin";
import { db } from "@/lib/db";

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const invitation = await db.invitation.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) notFound();
  return <main className="invite-page"><div className="invite-box"><div className="brand"><span className="brand-mark"><Wrench /></span><strong>RepairFlow</strong></div><ShieldCheck className="invite-icon" /><p className="eyebrow">One-time invitation</p><h1>Join as {invitation.role.toLowerCase()}</h1><p>This invitation is bound to <strong>{invitation.email}</strong> and expires in 48 hours.</p>{query.error ? <p className="alert error">{query.error}</p> : null}<form className="form-panel flat" action={acceptInvitationAction}><input type="hidden" name="token" value={token} /><div className="field"><label htmlFor="name">Name</label><input id="name" name="name" required /></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={12} required aria-describedby="password-help" /><small id="password-help">At least 12 characters with upper/lower case, number and symbol.</small></div><button className="button button-primary">Create account</button></form></div></main>;
}
