ALTER TABLE "Establishment" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Establishment" ADD COLUMN "coverMediaId" TEXT;

CREATE UNIQUE INDEX "Establishment_coverMediaId_key" ON "Establishment"("coverMediaId");

ALTER TABLE "Establishment"
  ADD CONSTRAINT "Establishment_coverMediaId_fkey"
  FOREIGN KEY ("coverMediaId") REFERENCES "PortfolioMedia"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
