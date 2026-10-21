-- Établissements : les données métier sont rattachées à un établissement.
-- L'existant devient l'établissement par défaut.

CREATE TABLE "Establishment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EstablishmentMember" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    CONSTRAINT "EstablishmentMember_pkey" PRIMARY KEY ("userId","establishmentId")
);

ALTER TABLE "User" ADD COLUMN "activeEstablishmentId" TEXT;

ALTER TABLE "Booking" ADD COLUMN "establishmentId" TEXT;
ALTER TABLE "AncillaryFee" ADD COLUMN "establishmentId" TEXT;
ALTER TABLE "CalendarBlock" ADD COLUMN "establishmentId" TEXT;
ALTER TABLE "DayConfig" ADD COLUMN "establishmentId" TEXT;
ALTER TABLE "StayPromoRule" ADD COLUMN "establishmentId" TEXT;
ALTER TABLE "PortfolioMedia" ADD COLUMN "establishmentId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "establishmentId" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "establishmentId" TEXT;

INSERT INTO "Establishment" ("id", "createdAt", "updatedAt", "name", "isDefault")
VALUES (
    'est_default',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    COALESCE((SELECT "studioName" FROM "SiteSettings" ORDER BY "createdAt" ASC LIMIT 1), 'Studio des Grenadiers'),
    true
);

UPDATE "Booking" SET "establishmentId" = 'est_default' WHERE "establishmentId" IS NULL;
UPDATE "AncillaryFee" SET "establishmentId" = 'est_default' WHERE "establishmentId" IS NULL;
UPDATE "CalendarBlock" SET "establishmentId" = 'est_default' WHERE "establishmentId" IS NULL;
UPDATE "DayConfig" SET "establishmentId" = 'est_default' WHERE "establishmentId" IS NULL;
UPDATE "StayPromoRule" SET "establishmentId" = 'est_default' WHERE "establishmentId" IS NULL;
UPDATE "PortfolioMedia" SET "establishmentId" = 'est_default' WHERE "establishmentId" IS NULL;
UPDATE "Conversation" SET "establishmentId" = 'est_default' WHERE "establishmentId" IS NULL;

-- Une fiche réglages pour l'établissement par défaut. Les doublons éventuels deviennent des établissements vides.
WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS n
    FROM "SiteSettings"
)
UPDATE "SiteSettings" s
SET "establishmentId" = 'est_default'
FROM ranked r
WHERE s."id" = r."id" AND r.n = 1;

INSERT INTO "Establishment" ("id", "createdAt", "updatedAt", "name", "isDefault")
SELECT
    'est_' || substr(md5(s."id"), 1, 20),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    COALESCE(s."studioName", 'Établissement'),
    false
FROM "SiteSettings" s
WHERE s."establishmentId" IS NULL;

UPDATE "SiteSettings" s
SET "establishmentId" = 'est_' || substr(md5(s."id"), 1, 20)
WHERE s."establishmentId" IS NULL;

INSERT INTO "SiteSettings" ("id", "createdAt", "updatedAt", "studioName", "establishmentId", "equipments")
SELECT 'set_default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Studio des Grenadiers', 'est_default', ARRAY[]::TEXT[]
WHERE NOT EXISTS (SELECT 1 FROM "SiteSettings" WHERE "establishmentId" = 'est_default');

ALTER TABLE "Booking" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "AncillaryFee" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "CalendarBlock" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "DayConfig" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "StayPromoRule" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "PortfolioMedia" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "Conversation" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "SiteSettings" ALTER COLUMN "establishmentId" SET NOT NULL;

DROP INDEX "DayConfig_date_key";
DROP INDEX "Conversation_clientId_key";

CREATE UNIQUE INDEX "DayConfig_establishmentId_date_key" ON "DayConfig"("establishmentId", "date");
CREATE UNIQUE INDEX "Conversation_clientId_establishmentId_key" ON "Conversation"("clientId", "establishmentId");
CREATE UNIQUE INDEX "SiteSettings_establishmentId_key" ON "SiteSettings"("establishmentId");

CREATE INDEX "Booking_establishmentId_idx" ON "Booking"("establishmentId");
CREATE INDEX "AncillaryFee_establishmentId_idx" ON "AncillaryFee"("establishmentId");
CREATE INDEX "CalendarBlock_establishmentId_idx" ON "CalendarBlock"("establishmentId");
CREATE INDEX "DayConfig_establishmentId_idx" ON "DayConfig"("establishmentId");
CREATE INDEX "StayPromoRule_establishmentId_idx" ON "StayPromoRule"("establishmentId");
CREATE INDEX "PortfolioMedia_establishmentId_idx" ON "PortfolioMedia"("establishmentId");
CREATE INDEX "Conversation_establishmentId_idx" ON "Conversation"("establishmentId");
CREATE INDEX "EstablishmentMember_establishmentId_idx" ON "EstablishmentMember"("establishmentId");
CREATE INDEX "User_activeEstablishmentId_idx" ON "User"("activeEstablishmentId");

ALTER TABLE "EstablishmentMember" ADD CONSTRAINT "EstablishmentMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EstablishmentMember" ADD CONSTRAINT "EstablishmentMember_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_activeEstablishmentId_fkey" FOREIGN KEY ("activeEstablishmentId") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AncillaryFee" ADD CONSTRAINT "AncillaryFee_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DayConfig" ADD CONSTRAINT "DayConfig_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StayPromoRule" ADD CONSTRAINT "StayPromoRule_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioMedia" ADD CONSTRAINT "PortfolioMedia_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EstablishmentMember" ("createdAt", "userId", "establishmentId")
SELECT CURRENT_TIMESTAMP, u."id", e."id"
FROM "User" u
CROSS JOIN "Establishment" e
WHERE u."role" = 'ADMIN'
ON CONFLICT DO NOTHING;

UPDATE "User" u
SET "activeEstablishmentId" = 'est_default'
WHERE u."role" = 'ADMIN' AND u."activeEstablishmentId" IS NULL;
