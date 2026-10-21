-- Lien optionnel Message → Booking, supprimé en cascade avec la réservation.
ALTER TABLE "Message" ADD COLUMN "bookingId" TEXT;

-- Messages déjà écrits avec « Identifiant réservation: … ».
UPDATE "Message" AS m
SET "bookingId" = b.id
FROM "Booking" AS b
WHERE m."bookingId" IS NULL
  AND m."body" LIKE '%Identifiant réservation: ' || b.id || '%';

CREATE INDEX "Message_bookingId_idx" ON "Message"("bookingId");

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
