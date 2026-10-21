CREATE TABLE "MonthlyTenant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "establishmentId" TEXT NOT NULL,
    CONSTRAINT "MonthlyTenant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MonthlyTenant_establishmentId_idx" ON "MonthlyTenant"("establishmentId");

ALTER TABLE "MonthlyTenant" ADD CONSTRAINT "MonthlyTenant_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MonthlyTenant" ("id", "createdAt", "updatedAt", "name", "email", "establishmentId")
SELECT
    'tnt_' || substr(md5("id"), 1, 20),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    btrim("tenantName"),
    NULLIF(btrim("tenantEmail"), ''),
    "id"
FROM "Establishment"
WHERE "rentalKind" = 'UNFURNISHED_MONTHLY'
  AND "tenantName" IS NOT NULL
  AND btrim("tenantName") <> '';
