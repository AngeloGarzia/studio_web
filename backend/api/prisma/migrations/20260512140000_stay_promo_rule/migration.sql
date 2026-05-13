-- CreateTable
CREATE TABLE "StayPromoRule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validToInclusive" TIMESTAMP(3) NOT NULL,
    "minStayNights" INTEGER NOT NULL,
    "promoPercent" INTEGER NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StayPromoRule_pkey" PRIMARY KEY ("id")
);
