-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "forwardedFor" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "userAgent" TEXT,
    "referer" TEXT,
    "userId" TEXT,
    "userRole" TEXT,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);
