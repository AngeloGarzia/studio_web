-- Suppression de l’historique email externe et des paramètres SMTP/IMAP (messagerie interne uniquement).
DROP TABLE IF EXISTS "EmailLog";

ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailSmtpHost";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailSmtpPort";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailSmtpSecure";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailSmtpUser";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailSmtpPass";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailFromAddress";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailFromName";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailImapHost";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailImapPort";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailImapSecure";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailImapUser";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailImapPass";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailImapOAuthClientId";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailImapOAuthClientSecret";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailImapOAuthRefreshToken";
ALTER TABLE "SiteSettings" DROP COLUMN IF EXISTS "mailImapOAuthTenant";
