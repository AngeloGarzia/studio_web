-- OAuth2 IMAP Microsoft (stockage en base, alternative au .env)
-- IF NOT EXISTS : tolère une base déjà partiellement à jour.
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "mailImapOAuthClientId" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "mailImapOAuthClientSecret" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "mailImapOAuthRefreshToken" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "mailImapOAuthTenant" TEXT;
