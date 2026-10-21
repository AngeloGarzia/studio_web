CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "userId" TEXT,
    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Owner_userId_key" ON "Owner"("userId");

CREATE TABLE "EstablishmentOwner" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    CONSTRAINT "EstablishmentOwner_pkey" PRIMARY KEY ("ownerId","establishmentId")
);

CREATE INDEX "EstablishmentOwner_establishmentId_idx" ON "EstablishmentOwner"("establishmentId");

ALTER TABLE "Owner" ADD CONSTRAINT "Owner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EstablishmentOwner" ADD CONSTRAINT "EstablishmentOwner_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EstablishmentOwner" ADD CONSTRAINT "EstablishmentOwner_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Owner" ("id", "createdAt", "updatedAt", "firstName", "lastName", "email", "phone", "userId")
SELECT
  'own_' || substr(md5(u."id"), 1, 24),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CASE
    WHEN position(' ' in btrim(coalesce(u."profileName", ''))) > 0 THEN split_part(btrim(u."profileName"), ' ', 1)
    ELSE ''
  END,
  CASE
    WHEN btrim(coalesce(u."profileName", '')) = '' THEN split_part(u."email", '@', 1)
    WHEN position(' ' in btrim(u."profileName")) > 0 THEN btrim(substr(btrim(u."profileName"), position(' ' in btrim(u."profileName")) + 1))
    ELSE btrim(u."profileName")
  END,
  u."email",
  u."phone",
  u."id"
FROM "User" u
WHERE u."role" = 'ADMIN';

INSERT INTO "EstablishmentOwner" ("createdAt", "ownerId", "establishmentId")
SELECT CURRENT_TIMESTAMP, o."id", m."establishmentId"
FROM "EstablishmentMember" m
JOIN "Owner" o ON o."userId" = m."userId"
ON CONFLICT DO NOTHING;

INSERT INTO "Owner" ("id", "createdAt", "updatedAt", "firstName", "lastName")
SELECT
  'own_est_' || substr(md5(e."id"), 1, 20),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  '',
  COALESCE(NULLIF(btrim(s."ownerName"), ''), NULLIF(btrim(e."name"), ''), 'Propriétaire')
FROM "Establishment" e
LEFT JOIN "SiteSettings" s ON s."establishmentId" = e."id"
WHERE NOT EXISTS (
  SELECT 1 FROM "EstablishmentOwner" eo WHERE eo."establishmentId" = e."id"
);

INSERT INTO "EstablishmentOwner" ("createdAt", "ownerId", "establishmentId")
SELECT CURRENT_TIMESTAMP, 'own_est_' || substr(md5(e."id"), 1, 20), e."id"
FROM "Establishment" e
WHERE NOT EXISTS (
  SELECT 1 FROM "EstablishmentOwner" eo WHERE eo."establishmentId" = e."id"
);
