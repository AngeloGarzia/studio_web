-- CreateTable
CREATE TABLE "DayConfig" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "arrivalAllowed" BOOLEAN NOT NULL DEFAULT true,
    "departureAllowed" BOOLEAN NOT NULL DEFAULT true,
    "promoPercent" INTEGER,
    "promoLabel" TEXT,

    CONSTRAINT "DayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayConfig_date_key" ON "DayConfig"("date");
