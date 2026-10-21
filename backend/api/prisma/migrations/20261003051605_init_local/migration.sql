-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "equipments" TEXT[],
ADD COLUMN     "lodgingType" TEXT,
ADD COLUMN     "socialLinks" JSONB,
ADD COLUMN     "surfaceM2" INTEGER;
