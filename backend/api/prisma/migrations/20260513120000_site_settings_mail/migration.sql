-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN "mailSmtpHost" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "mailSmtpPort" INTEGER;
ALTER TABLE "SiteSettings" ADD COLUMN "mailSmtpSecure" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteSettings" ADD COLUMN "mailSmtpUser" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "mailSmtpPass" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "mailFromAddress" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "mailFromName" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "mailImapHost" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "mailImapPort" INTEGER;
ALTER TABLE "SiteSettings" ADD COLUMN "mailImapSecure" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SiteSettings" ADD COLUMN "mailImapUser" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "mailImapPass" TEXT;
