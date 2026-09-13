import { Building2, Copy, MailPlus, MailX, UserMinus, UserRound } from "lucide-react";
import { createInvitationAction, endTenantPropertyLinkAction, linkTenantAction, revokeInvitationAction, setMemberActiveAction, updateContractorProfileAction } from "@/app/actions/admin";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; invite?: string }> }) {
  await requireViewer(["MANAGER"]);
  const [users, properties, pendingInvitations, notice] = await Promise.all([
    db.user.findMany({ include: { contractorProfile: true, tenantProperties: { where: { endsAt: null }, include: { property: { select: { name: true } } } } }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    db.property.findMany({ orderBy: { name: "asc" } }),
    db.invitation.findMany({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 20 }),
    searchParams,
  ]);
  const tenants = users.filter((user) => user.role === "TENANT");
  const contractors = users.filter((user) => user.role === "CONTRACTOR");
  const activeTenancies = tenants.flatMap((tenant) => tenant.tenantProperties.map((link) => ({ ...link, tenantName: tenant.name })));
  const expiry = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" });

  return <>
    <header className="page-heading"><div><p className="eyebrow">Access and assignments</p><h1>People</h1><p>Invite accounts with a fixed role and maintain operational access.</p></div></header>
    {notice.success ? <p className="alert success">{notice.success}</p> : null}
    {notice.error ? <p className="alert error">{notice.error}</p> : null}
    {notice.invite ? <div className="invite-result"><Copy /><div><strong>One-time invitation created</strong><code>{notice.invite}</code><small>Share securely. It expires in 48 hours and cannot be reused.</small></div></div> : null}
    <div className="admin-grid wide">
      <div className="form-stack">
        <section className="record-list">{users.map((user) => <article className="record-row" key={user.id}><span className="record-icon"><UserRound /></span><span><strong>{user.name}</strong><small>{user.email}</small></span><span className="role-label">{user.role.toLowerCase()}</span><span>{user.role === "TENANT" ? user.tenantProperties.map((link) => link.property.name).join(", ") || "No property" : user.contractorProfile?.businessName ?? "Team"}</span><form action={setMemberActiveAction}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="active" value={String(!user.active)} /><button className="button button-secondary">{user.active ? "Deactivate" : "Activate"}</button></form></article>)}</section>
        <section className="form-panel management-panel"><div className="detail-title"><MailX /><h2>Pending invitations</h2></div>{pendingInvitations.length ? <div className="management-list">{pendingInvitations.map((invitation) => <article className="management-row" key={invitation.id}><span><strong>{invitation.email}</strong><small>{invitation.role.toLowerCase()} · expires {expiry.format(invitation.expiresAt)}</small></span><form action={revokeInvitationAction}><input type="hidden" name="invitationId" value={invitation.id} /><button className="button button-secondary">Revoke</button></form></article>)}</div> : <p className="muted-copy">No active invitation links.</p>}</section>
      </div>
      <div className="form-stack">
        <form className="form-panel" action={createInvitationAction}><div className="detail-title"><MailPlus /><h2>Create invitation</h2></div><div className="field"><label htmlFor="invite-email">Email</label><input id="invite-email" name="email" type="email" required /></div><div className="field"><label htmlFor="invite-role">Role</label><select id="invite-role" name="role"><option value="TENANT">Tenant</option><option value="CONTRACTOR">Contractor</option><option value="MANAGER">Property manager</option></select></div><button className="button button-primary">Create one-time link</button></form>
        <form className="form-panel" action={linkTenantAction}><div className="detail-title"><Building2 /><h2>Link tenant to property</h2></div><div className="field"><label htmlFor="tenantId">Tenant</label><select id="tenantId" name="tenantId">{tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}</select></div><div className="field"><label htmlFor="propertyId">Property</label><select id="propertyId" name="propertyId">{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></div><button className="button button-secondary" disabled={!tenants.length || !properties.length}>Link tenant</button></form>
        <form className="form-panel" action={endTenantPropertyLinkAction}><div className="detail-title"><UserMinus /><h2>End tenant property link</h2></div><div className="field"><label htmlFor="linkId">Active link</label><select id="linkId" name="linkId">{activeTenancies.map((link) => <option value={link.id} key={link.id}>{link.tenantName} · {link.property.name}</option>)}</select></div><button className="button button-secondary" disabled={!activeTenancies.length}>End link</button></form>
        <form className="form-panel" action={updateContractorProfileAction}><div className="detail-title"><UserRound /><h2>Contractor service profile</h2></div><div className="field"><label htmlFor="contractor-user">Contractor</label><select id="contractor-user" name="userId">{contractors.map((contractor) => <option value={contractor.id} key={contractor.id}>{contractor.name}</option>)}</select></div><div className="field"><label htmlFor="businessName">Business name</label><input id="businessName" name="businessName" required /></div><div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" required /></div><div className="field"><label htmlFor="trades">Trades</label><input id="trades" name="trades" placeholder="Plumbing, Electrical" required /></div><div className="field"><label htmlFor="servicePostcodes">Service postcodes</label><input id="servicePostcodes" name="servicePostcodes" placeholder="2000, 2009" required /></div><button className="button button-secondary" disabled={!contractors.length}>Save service profile</button></form>
      </div>
    </div>
  </>;
}
