ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;

-- Le nom affiché était « Prénom Nom ». Le premier mot devient le prénom, le reste le nom.
UPDATE "User"
SET
  "firstName" = split_part(btrim("profileName"), ' ', 1),
  "lastName" = NULLIF(btrim(regexp_replace(btrim("profileName"), '^\S+\s*', '')), '')
WHERE "profileName" IS NOT NULL AND btrim("profileName") <> '';
