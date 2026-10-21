CREATE TABLE "Quittance" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "tenantName" TEXT NOT NULL,
    "logement" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "feeLines" JSONB NOT NULL,
    CONSTRAINT "Quittance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuittanceTenant" (
    "quittanceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "QuittanceTenant_pkey" PRIMARY KEY ("quittanceId", "tenantId")
);

CREATE TABLE "QuittanceOwner" (
    "quittanceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    CONSTRAINT "QuittanceOwner_pkey" PRIMARY KEY ("quittanceId", "ownerId")
);

CREATE INDEX "Quittance_establishmentId_idx" ON "Quittance"("establishmentId");
CREATE INDEX "QuittanceTenant_tenantId_idx" ON "QuittanceTenant"("tenantId");
CREATE INDEX "QuittanceOwner_ownerId_idx" ON "QuittanceOwner"("ownerId");

ALTER TABLE "Quittance" ADD CONSTRAINT "Quittance_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuittanceTenant" ADD CONSTRAINT "QuittanceTenant_quittanceId_fkey" FOREIGN KEY ("quittanceId") REFERENCES "Quittance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuittanceTenant" ADD CONSTRAINT "QuittanceTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "MonthlyTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuittanceOwner" ADD CONSTRAINT "QuittanceOwner_quittanceId_fkey" FOREIGN KEY ("quittanceId") REFERENCES "Quittance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuittanceOwner" ADD CONSTRAINT "QuittanceOwner_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
