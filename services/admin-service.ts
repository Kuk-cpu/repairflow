import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { AppRole } from "@/lib/auth";
import type { Viewer } from "@/lib/session";
import { WorkflowError } from "@/domain/workflow";

function manager(viewer: Viewer) {
  if (viewer.role !== "MANAGER") throw new WorkflowError("Manager access required.", "FORBIDDEN", 403);
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createProperty(viewer: Viewer, input: { name: string; addressLine: string; suburb: string; state: string; postcode: string }) {
  manager(viewer);
  return db.$transaction(async (tx) => {
    const property = await tx.property.create({ data: input });
    await tx.auditLog.create({ data: { actorId: viewer.id, action: "PROPERTY_CREATED", entityType: "Property", entityId: property.id, outcome: "SUCCESS" } });
    return property;
  });
}

export async function createAsset(viewer: Viewer, input: { propertyId: string; name: string; category: string; manufacturer?: string; model?: string; serialNumber?: string }) {
  manager(viewer);
  const property = await db.property.findUnique({ where: { id: input.propertyId } });
  if (!property) throw new WorkflowError("Property not found.");
  return db.$transaction(async (tx) => {
    const asset = await tx.asset.create({ data: input });
    await tx.auditLog.create({ data: { actorId: viewer.id, action: "ASSET_CREATED", entityType: "Asset", entityId: asset.id, outcome: "SUCCESS", metadata: { propertyId: input.propertyId } } });
    return asset;
  });
}

export async function updateTeamConfig(viewer: Viewer, input: { teamName: string; emergencyPhone: string; contractorResponseHours: number; appointmentReminderHours: number; pendingConfirmationHours: number }) {
  manager(viewer);
  return db.$transaction(async (tx) => {
    const config = await tx.teamConfig.update({ where: { id: "default" }, data: input });
    await tx.auditLog.create({ data: { actorId: viewer.id, action: "TEAM_CONFIG_UPDATED", entityType: "TeamConfig", entityId: config.id, outcome: "SUCCESS" } });
    return config;
  });
}

export async function createInvitation(viewer: Viewer, input: { email: string; role: AppRole }) {
  manager(viewer);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.$transaction(async (tx) => {
    const invitation = await tx.invitation.create({ data: { email: input.email.toLowerCase(), role: input.role, tokenHash, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), createdById: viewer.id } });
    await tx.auditLog.create({ data: { actorId: viewer.id, action: "INVITATION_CREATED", entityType: "Invitation", entityId: invitation.id, outcome: "SUCCESS", metadata: { role: input.role } } });
  });
  return token;
}

export async function acceptInvitation(input: { token: string; name: string; password: string }) {
  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const invitation = await db.invitation.findUnique({ where: { tokenHash } });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) throw new WorkflowError("This invitation is invalid, expired, revoked or already used.", "INVITE_REJECTED", 400);
  const existing = await db.user.findUnique({ where: { email: invitation.email } });
  if (existing) throw new WorkflowError("An account already exists for this invitation.", "INVITE_REJECTED", 400);
  const password = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
    if (claimed.count !== 1) throw new WorkflowError("This invitation has already been used.", "INVITE_REJECTED", 400);
    const user = await tx.user.create({ data: { id: randomUUID(), name: input.name, email: invitation.email, emailVerified: true, role: invitation.role } });
    await tx.account.create({ data: { id: randomUUID(), providerId: "credential", accountId: user.id, userId: user.id, password } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "INVITATION_ACCEPTED", entityType: "User", entityId: user.id, outcome: "SUCCESS", metadata: { role: invitation.role } } });
    return user;
  });
}

export async function revokeInvitation(viewer: Viewer, input: { invitationId: string }) {
  manager(viewer);
  return db.$transaction(async (tx) => {
    const updated = await tx.invitation.updateMany({ where: { id: input.invitationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
    if (updated.count !== 1) throw new WorkflowError("That invitation is no longer available to revoke.");
    await tx.auditLog.create({ data: { actorId: viewer.id, action: "INVITATION_REVOKED", entityType: "Invitation", entityId: input.invitationId, outcome: "SUCCESS" } });
  });
}

export async function linkTenant(viewer: Viewer, input: { tenantId: string; propertyId: string }) {
  manager(viewer);
  const [tenant, property] = await Promise.all([db.user.findFirst({ where: { id: input.tenantId, role: "TENANT", active: true } }), db.property.findUnique({ where: { id: input.propertyId } })]);
  if (!tenant || !property) throw new WorkflowError("Tenant or property not found.");
  const current = await db.tenantProperty.findFirst({ where: { tenantId: tenant.id, propertyId: property.id, endsAt: null } });
  if (current) return current;
  try {
    return await db.$transaction(async (tx) => {
      const link = await tx.tenantProperty.create({ data: { tenantId: tenant.id, propertyId: property.id } });
      await tx.auditLog.create({ data: { actorId: viewer.id, action: "TENANT_PROPERTY_LINKED", entityType: "TenantProperty", entityId: link.id, outcome: "SUCCESS", metadata: { tenantId: tenant.id, propertyId: property.id } } });
      return link;
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const winner = await db.tenantProperty.findFirst({ where: { tenantId: tenant.id, propertyId: property.id, endsAt: null } });
    if (!winner) throw error;
    return winner;
  }
}

export async function endTenantPropertyLink(viewer: Viewer, input: { linkId: string }) {
  manager(viewer);
  return db.$transaction(async (tx) => {
    const link = await tx.tenantProperty.findUnique({ where: { id: input.linkId } });
    if (!link) throw new WorkflowError("That active tenancy link was not found.");
    const updated = await tx.tenantProperty.updateMany({ where: { id: link.id, endsAt: null }, data: { endsAt: new Date() } });
    if (updated.count !== 1) throw new WorkflowError("That active tenancy link was not found.");
    await tx.auditLog.create({ data: { actorId: viewer.id, action: "TENANT_PROPERTY_ENDED", entityType: "TenantProperty", entityId: link.id, outcome: "SUCCESS", metadata: { tenantId: link.tenantId, propertyId: link.propertyId } } });
  });
}

export async function updateContractorProfile(viewer: Viewer, input: { userId: string; businessName: string; phone: string; trades: string[]; servicePostcodes: string[] }) {
  manager(viewer);
  const user = await db.user.findFirst({ where: { id: input.userId, role: "CONTRACTOR" } });
  if (!user) throw new WorkflowError("Contractor account not found.");
  return db.$transaction(async (tx) => {
    const profile = await tx.contractorProfile.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, businessName: input.businessName, phone: input.phone, trades: input.trades, servicePostcodes: input.servicePostcodes },
      update: { businessName: input.businessName, phone: input.phone, trades: input.trades, servicePostcodes: input.servicePostcodes },
    });
    await tx.auditLog.create({ data: { actorId: viewer.id, action: "CONTRACTOR_PROFILE_UPDATED", entityType: "User", entityId: input.userId, outcome: "SUCCESS" } });
    return profile;
  });
}

export async function setMemberActive(viewer: Viewer, input: { userId: string; active: boolean }) {
  manager(viewer);
  if (input.userId === viewer.id && !input.active) throw new WorkflowError("You cannot deactivate your own account.");
  return db.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: input.userId }, data: { active: input.active } });
    if (!input.active) await tx.session.deleteMany({ where: { userId: input.userId } });
    if (user.role === "CONTRACTOR") await tx.contractorProfile.updateMany({ where: { userId: user.id }, data: { active: input.active } });
    await tx.auditLog.create({ data: { actorId: viewer.id, action: input.active ? "MEMBER_ACTIVATED" : "MEMBER_DEACTIVATED", entityType: "User", entityId: user.id, outcome: "SUCCESS" } });
    return user;
  });
}

export async function retryOutboxJob(viewer: Viewer, input: { jobId: string }) {
  manager(viewer);
  return db.$transaction(async (tx) => {
    const updated = await tx.outboxJob.updateMany({ where: { id: input.jobId, status: "FAILED" }, data: { status: "PENDING", attempts: 0, availableAt: new Date(), lockedAt: null, lockedBy: null } });
    if (updated.count !== 1) throw new WorkflowError("That failed job is no longer available to retry.");
    await tx.auditLog.create({ data: { actorId: viewer.id, action: "OUTBOX_JOB_RETRIED", entityType: "OutboxJob", entityId: input.jobId, outcome: "SUCCESS" } });
  });
}
