ALTER TABLE "MonthlyTenant" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MonthlyTenant" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MonthlyTenant" ADD COLUMN "formerAddress" TEXT;
ALTER TABLE "MonthlyTenant" ADD COLUMN "visaNumber" TEXT;
ALTER TABLE "MonthlyTenant" ADD COLUMN "nationality" TEXT;
ALTER TABLE "MonthlyTenant" ADD COLUMN "birthDate" TIMESTAMP(3);
ALTER TABLE "MonthlyTenant" ADD COLUMN "leaseStart" TIMESTAMP(3);

UPDATE "MonthlyTenant"
SET
  "firstName" = CASE
    WHEN position(' ' in btrim("name")) > 0 THEN split_part(btrim("name"), ' ', 1)
    ELSE ''
  END,
  "lastName" = CASE
    WHEN position(' ' in btrim("name")) > 0 THEN btrim(substr(btrim("name"), position(' ' in btrim("name")) + 1))
    ELSE btrim("name")
  END,
  "leaseStart" = date_trunc('month', "createdAt")
WHERE "lastName" = '';

CREATE TABLE "RentReceipt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "rentCents" INTEGER NOT NULL,
    "chargesCents" INTEGER NOT NULL,
    "receivedCents" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "bailleurName" TEXT NOT NULL,
    "bailleurAddress" TEXT NOT NULL DEFAULT '',
    "bailleurPhone" TEXT NOT NULL DEFAULT '',
    "bailleurEmail" TEXT NOT NULL DEFAULT '',
    "logement" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    CONSTRAINT "RentReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RentReceipt_tenantId_periodFrom_key" ON "RentReceipt"("tenantId", "periodFrom");
CREATE INDEX "RentReceipt_establishmentId_idx" ON "RentReceipt"("establishmentId");

ALTER TABLE "RentReceipt" ADD CONSTRAINT "RentReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "MonthlyTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentReceipt" ADD CONSTRAINT "RentReceipt_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
