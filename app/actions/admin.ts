"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { acceptInvitation, createAsset, createInvitation, createProperty, endTenantPropertyLink, linkTenant, retryOutboxJob, revokeInvitation, setMemberActive, updateContractorProfile, updateTeamConfig } from "@/services/admin-service";
import { requireViewer } from "@/lib/session";

const t = z.string().trim().min(2).max(500);
const id = z.string().min(3).max(100);
const errorMessage = (error: unknown) => { unstable_rethrow(error); return error instanceof Error ? error.message.slice(0, 180) : "Action failed"; };

export async function createPropertyAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  try {
    await createProperty(viewer, z.object({ name: t.max(120), addressLine: t.max(180), suburb: t.max(80), state: t.max(10), postcode: z.string().trim().regex(/^\d{4}$/) }).parse(Object.fromEntries(formData)));
    revalidatePath("/properties"); redirect("/properties?success=Property%20created");
  } catch (error) { redirect(`/properties?error=${encodeURIComponent(errorMessage(error))}`); }
}

export async function createAssetAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  const parsed = z.object({ propertyId: id, name: t.max(120), category: t.max(80), manufacturer: z.string().trim().max(100).optional(), model: z.string().trim().max(100).optional(), serialNumber: z.string().trim().max(100).optional() }).parse(Object.fromEntries(formData));
  try { await createAsset(viewer, parsed); revalidatePath(`/properties/${parsed.propertyId}`); redirect(`/properties/${parsed.propertyId}?success=Asset%20created`); } catch (error) { redirect(`/properties/${parsed.propertyId}?error=${encodeURIComponent(errorMessage(error))}`); }
}

export async function updateConfigAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  try {
    await updateTeamConfig(viewer, z.object({ teamName: t.max(120), emergencyPhone: t.max(500), contractorResponseHours: z.coerce.number().int().min(1).max(720), appointmentReminderHours: z.coerce.number().int().min(1).max(168), pendingConfirmationHours: z.coerce.number().int().min(1).max(720) }).parse(Object.fromEntries(formData)));
    revalidatePath("/settings"); redirect("/settings?success=Settings%20saved");
  } catch (error) { redirect(`/settings?error=${encodeURIComponent(errorMessage(error))}`); }
}

export async function createInvitationAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  try {
    const parsed = z.object({ email: z.string().email(), role: z.enum(["MANAGER", "TENANT", "CONTRACTOR"]) }).parse(Object.fromEntries(formData));
    const token = await createInvitation(viewer, parsed);
    revalidatePath("/members"); redirect(`/members?invite=${encodeURIComponent(`${process.env.APP_ORIGIN}/invite/${token}`)}`);
  } catch (error) { redirect(`/members?error=${encodeURIComponent(errorMessage(error))}`); }
}

export async function linkTenantAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  const parsed = z.object({ tenantId: id, propertyId: id }).parse(Object.fromEntries(formData));
  try { await linkTenant(viewer, parsed); revalidatePath("/members"); redirect("/members?success=Tenant%20linked"); } catch (error) { redirect(`/members?error=${encodeURIComponent(errorMessage(error))}`); }
}

export async function endTenantPropertyLinkAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  try {
    await endTenantPropertyLink(viewer, { linkId: id.parse(formData.get("linkId")) });
    revalidatePath("/members"); redirect("/members?success=Tenant%20property%20link%20ended");
  } catch (error) { redirect(`/members?error=${encodeURIComponent(errorMessage(error))}`); }
}

export async function revokeInvitationAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  try {
    await revokeInvitation(viewer, { invitationId: id.parse(formData.get("invitationId")) });
    revalidatePath("/members"); redirect("/members?success=Invitation%20revoked");
  } catch (error) { redirect(`/members?error=${encodeURIComponent(errorMessage(error))}`); }
}

export async function acceptInvitationAction(formData: FormData) {
  const token = z.string().min(20).parse(formData.get("token"));
  try {
    await acceptInvitation(z.object({ token: z.string(), name: t.max(120), password: z.string().min(12).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[^A-Za-z0-9]/) }).parse(Object.fromEntries(formData)));
    redirect("/login?success=Account%20created");
  } catch (error) { redirect(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(errorMessage(error))}`); }
}

export async function updateContractorProfileAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  try {
    const parsed = z.object({ userId: id, businessName: t.max(120), phone: t.max(40), trades: t.max(500), servicePostcodes: t.max(500) }).parse(Object.fromEntries(formData));
    const split = (input: string) => input.split(",").map((item) => item.trim()).filter(Boolean);
    const servicePostcodes = split(parsed.servicePostcodes);
    if (!servicePostcodes.length || servicePostcodes.some((postcode) => !/^\d{4}$/.test(postcode))) throw new Error("Service postcodes must be comma-separated four-digit values.");
    await updateContractorProfile(viewer, { ...parsed, trades: split(parsed.trades), servicePostcodes });
    revalidatePath("/members"); redirect("/members?success=Contractor%20profile%20saved");
  } catch (error) { redirect(`/members?error=${encodeURIComponent(errorMessage(error))}`); }
}

export async function setMemberActiveAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  try {
    const parsed = z.object({ userId: id, active: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
    await setMemberActive(viewer, { userId: parsed.userId, active: parsed.active === "true" });
    revalidatePath("/members"); redirect(`/members?success=Member%20${parsed.active === "true" ? "activated" : "deactivated"}`);
  } catch (error) { redirect(`/members?error=${encodeURIComponent(errorMessage(error))}`); }
}

export async function retryOutboxJobAction(formData: FormData) {
  const viewer = await requireViewer(["MANAGER"]);
  try {
    const jobId = id.parse(formData.get("jobId"));
    await retryOutboxJob(viewer, { jobId });
    revalidatePath("/settings"); redirect("/settings?success=Job%20queued%20for%20retry");
  } catch (error) { redirect(`/settings?error=${encodeURIComponent(errorMessage(error))}`); }
}
