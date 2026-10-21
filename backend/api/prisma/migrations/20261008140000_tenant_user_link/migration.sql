ALTER TABLE "MonthlyTenant" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "MonthlyTenant_userId_key" ON "MonthlyTenant"("userId");

ALTER TABLE "MonthlyTenant" ADD CONSTRAINT "MonthlyTenant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "MonthlyTenant" AS t
SET "userId" = match."userId"
FROM (
  SELECT DISTINCT ON (u."id") t2."id" AS "tenantId", u."id" AS "userId"
  FROM "MonthlyTenant" t2
  JOIN "User" u ON lower(t2."email") = lower(u."email")
  WHERE t2."email" IS NOT NULL
    AND btrim(t2."email") <> ''
    AND NOT EXISTS (SELECT 1 FROM "Owner" o WHERE o."userId" = u."id")
  ORDER BY u."id", t2."createdAt"
) AS match
WHERE t."id" = match."tenantId";
