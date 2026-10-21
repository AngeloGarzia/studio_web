import { PrismaClient } from "@prisma/client";

let prismaSingleton: PrismaClient = new PrismaClient();

function hasStayPromoDelegate(p: PrismaClient): boolean {
  const x = p as unknown as { stayPromoRule?: { findMany?: unknown } };
  return typeof x.stayPromoRule?.findMany === "function";
}

function hasAncillaryFeeDelegate(p: PrismaClient): boolean {
  const x = p as unknown as { ancillaryFee?: { findMany?: unknown } };
  return typeof x.ancillaryFee?.findMany === "function";
}

function hasOwnerDelegate(p: PrismaClient): boolean {
  return typeof (p as unknown as { owner?: { findMany?: unknown } }).owner?.findMany === "function";
}

function hasRentReceiptDelegate(p: PrismaClient): boolean {
  return typeof (p as unknown as { rentReceipt?: { upsert?: unknown } }).rentReceipt?.upsert === "function";
}

function hasQuittanceDelegate(p: PrismaClient): boolean {
  return typeof (p as unknown as { quittance?: { create?: unknown } }).quittance?.create === "function";
}

function hasEstablishmentDelegate(p: PrismaClient): boolean {
  const x = p as unknown as { establishment?: { findFirst?: unknown } };
  return typeof x.establishment?.findFirst === "function";
}

/**
 * tsx watch peut conserver une instance {@link PrismaClient} créée avant `prisma generate`.
 * Dans ce cas, des modèles récents sont absents : on recrée le client après déconnexion du vieux.
 * Un redémarrage du process recharge aussi les champs ajoutés aux modèles, comme la signature ou le lien message-réservation.
 */
function ensureFreshClient(): PrismaClient {
  if (
    hasStayPromoDelegate(prismaSingleton) &&
    hasAncillaryFeeDelegate(prismaSingleton) &&
    hasEstablishmentDelegate(prismaSingleton) &&
    hasRentReceiptDelegate(prismaSingleton) &&
    hasQuittanceDelegate(prismaSingleton) &&
    hasOwnerDelegate(prismaSingleton)
  ) {
    return prismaSingleton;
  }

  const previous = prismaSingleton;
  prismaSingleton = new PrismaClient();
  void previous.$disconnect().catch(() => undefined);
  return prismaSingleton;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const fresh = ensureFreshClient();
    const v = Reflect.get(fresh as object, prop as string | symbol);
    return typeof v === "function" ? (v as (...args: unknown[]) => unknown).bind(fresh) : v;
  },
  has(_, prop) {
    return Reflect.has(ensureFreshClient() as object, prop);
  }
});
