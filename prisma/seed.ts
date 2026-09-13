import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, QuoteStatus, Role, TicketPriority, TicketStatus, Visibility } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for seeding");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const demoPassword = "RepairFlow!2026";

async function upsertDemoUser(input: { id: string; name: string; email: string; role: Role }) {
  const password = await hashPassword(demoPassword);
  const user = await db.user.upsert({
    where: { email: input.email },
    create: { ...input, emailVerified: true, active: true },
    update: { name: input.name, role: input.role, active: true },
  });
  await db.account.upsert({
    where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
    create: { id: `${input.id}-credential`, providerId: "credential", accountId: user.id, userId: user.id, password },
    update: { password },
  });
  return user;
}

async function main() {
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to seed demo accounts unless DEMO_MODE=true");

  const [manager, tenantA, tenantB, plumber, electrician] = await Promise.all([
    upsertDemoUser({ id: "demo-manager", name: "Maya Chen", email: "manager@repairflow.test", role: Role.MANAGER }),
    upsertDemoUser({ id: "demo-tenant-a", name: "Alex Morgan", email: "alex@repairflow.test", role: Role.TENANT }),
    upsertDemoUser({ id: "demo-tenant-b", name: "Priya Shah", email: "priya@repairflow.test", role: Role.TENANT }),
    upsertDemoUser({ id: "demo-contractor-a", name: "Sam Rivera", email: "sam@repairflow.test", role: Role.CONTRACTOR }),
    upsertDemoUser({ id: "demo-contractor-b", name: "Jordan Lee", email: "jordan@repairflow.test", role: Role.CONTRACTOR }),
  ]);

  await db.teamConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  const harbour = await db.property.upsert({
    where: { id: "demo-property-harbour" },
    create: { id: "demo-property-harbour", name: "Harbour View Apartments", addressLine: "18 Bridge Street, Unit 4B", suburb: "Pyrmont", postcode: "2009" },
    update: {},
  });
  const park = await db.property.upsert({
    where: { id: "demo-property-park" },
    create: { id: "demo-property-park", name: "Park Lane Residences", addressLine: "52 Park Road, Unit 12", suburb: "Alexandria", postcode: "2015" },
    update: {},
  });

  await Promise.all([
    db.tenantProperty.upsert({
      where: { tenantId_propertyId_startsAt: { tenantId: tenantA.id, propertyId: harbour.id, startsAt: new Date("2026-01-01T00:00:00Z") } },
      create: { id: "demo-tenancy-a", tenantId: tenantA.id, propertyId: harbour.id, startsAt: new Date("2026-01-01T00:00:00Z") },
      update: { endsAt: null },
    }),
    db.tenantProperty.upsert({
      where: { tenantId_propertyId_startsAt: { tenantId: tenantB.id, propertyId: park.id, startsAt: new Date("2026-02-01T00:00:00Z") } },
      create: { id: "demo-tenancy-b", tenantId: tenantB.id, propertyId: park.id, startsAt: new Date("2026-02-01T00:00:00Z") },
      update: { endsAt: null },
    }),
    db.contractorProfile.upsert({
      where: { userId: plumber.id },
      create: { userId: plumber.id, businessName: "Clearline Plumbing", phone: "0400 111 203", trades: ["Plumbing", "Water damage"], servicePostcodes: ["2009", "2015", "2000"] },
      update: {},
    }),
    db.contractorProfile.upsert({
      where: { userId: electrician.id },
      create: { userId: electrician.id, businessName: "Bright Spark Electrical", phone: "0400 218 901", trades: ["Electrical", "Appliances"], servicePostcodes: ["2009", "2015", "2037"] },
      update: {},
    }),
  ]);

  const hotWater = await db.asset.upsert({
    where: { id: "demo-asset-hot-water" },
    create: { id: "demo-asset-hot-water", propertyId: harbour.id, name: "Hot water system", category: "Plumbing", manufacturer: "Rheem", model: "Stellar 330" },
    update: {},
  });

  const tickets = [
    { id: "demo-ticket-101", reference: "RF-2026-0101", propertyId: harbour.id, assetId: hotWater.id, createdById: tenantA.id, assignedContractorId: null, title: "Kitchen tap leaking", description: "The kitchen tap has been dripping constantly since Tuesday evening. Water is collecting under the sink.", location: "Kitchen", availability: "Weekdays after 4 pm", status: TicketStatus.SUBMITTED, priority: TicketPriority.HIGH, aiSummary: "Constant kitchen tap leak with water collecting below the sink.", aiLocation: "Kitchen", aiTimeMention: "since Tuesday evening", aiMissingInfo: ["Whether the isolation valve can be safely reached"] },
    { id: "demo-ticket-102", reference: "RF-2026-0102", propertyId: park.id, assetId: null, createdById: tenantB.id, assignedContractorId: electrician.id, title: "Bedroom power outlet not working", description: "The outlet beside the wardrobe stopped working. No smell, smoke or visible damage.", location: "Main bedroom", availability: "Thursday 9 am to noon", status: TicketStatus.ASSIGNED, priority: TicketPriority.NORMAL, aiSummary: "One bedroom power outlet is not working; no visible danger reported.", aiLocation: "Main bedroom", aiTimeMention: null, aiMissingInfo: ["Whether other outlets on the same wall work"] },
    { id: "demo-ticket-103", reference: "RF-2026-0103", propertyId: harbour.id, assetId: hotWater.id, createdById: tenantA.id, assignedContractorId: plumber.id, title: "Hot water temperature fluctuating", description: "Hot water alternates between warm and cold during showers.", location: "Bathroom", availability: "Monday or Wednesday morning", status: TicketStatus.SCHEDULED, priority: TicketPriority.NORMAL, aiSummary: "Shower hot water temperature fluctuates between warm and cold.", aiLocation: "Bathroom", aiTimeMention: "during showers", aiMissingInfo: [] },
    { id: "demo-ticket-104", reference: "RF-2026-0104", propertyId: park.id, assetId: null, createdById: tenantB.id, assignedContractorId: plumber.id, title: "Laundry drain cleared", description: "Laundry floor drain was slow and has been cleared.", location: "Laundry", availability: "Completed", status: TicketStatus.AWAITING_CONFIRMATION, priority: TicketPriority.LOW, aiSummary: "Laundry drain was cleared and awaits tenant confirmation.", aiLocation: "Laundry", aiTimeMention: null, aiMissingInfo: [], completionNotes: "Removed lint blockage, flushed drain and checked for leaks.", actualCostCents: 15400 },
  ];

  for (const input of tickets) {
    const ticket = await db.ticket.upsert({ where: { reference: input.reference }, create: { ...input, version: 1 }, update: {} });
    await db.ticketEvent.upsert({
      where: { idempotencyKey: `seed:${ticket.reference}:created` },
      create: { ticketId: ticket.id, actorId: ticket.createdById, type: "TICKET_CREATED", message: "Maintenance request submitted", visibility: Visibility.PARTICIPANTS, ticketVersion: 1, idempotencyKey: `seed:${ticket.reference}:created` },
      update: {},
    });
  }

  await db.quote.upsert({
    where: { ticketId_version: { ticketId: "demo-ticket-103", version: 1 } },
    create: { ticketId: "demo-ticket-103", submittedById: plumber.id, version: 1, status: QuoteStatus.APPROVED, amountCents: 28900, scope: "Inspect tempering valve and replace if faulty", decidedAt: new Date("2026-09-08T03:00:00Z"), decidedById: manager.id },
    update: {},
  });
  await db.appointment.upsert({
    where: { ticketId_version: { ticketId: "demo-ticket-103", version: 1 } },
    create: { ticketId: "demo-ticket-103", version: 1, startsAt: new Date("2026-09-15T00:00:00Z"), endsAt: new Date("2026-09-15T01:30:00Z"), tenantConfirmedAt: new Date("2026-09-09T02:00:00Z"), contractorConfirmedAt: new Date("2026-09-09T03:00:00Z"), createdById: manager.id },
    update: {},
  });

  console.log(`RepairFlow demo seed ready. Shared password: ${demoPassword}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => db.$disconnect());
