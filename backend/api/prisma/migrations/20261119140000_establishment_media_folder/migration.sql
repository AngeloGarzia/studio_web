-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN "mediaFolder" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Establishment_mediaFolder_key" ON "Establishment"("mediaFolder");
