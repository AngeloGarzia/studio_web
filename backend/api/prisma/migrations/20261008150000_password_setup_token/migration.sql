ALTER TABLE "User" ADD COLUMN "passwordSetupTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordSetupExpires" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_passwordSetupTokenHash_key" ON "User"("passwordSetupTokenHash");
