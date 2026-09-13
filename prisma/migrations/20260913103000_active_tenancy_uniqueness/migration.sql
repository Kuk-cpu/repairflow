CREATE UNIQUE INDEX "TenantProperty_one_active_link_key"
ON "TenantProperty" ("tenantId", "propertyId")
WHERE "endsAt" IS NULL;
