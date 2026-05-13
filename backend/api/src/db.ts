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

/**
 * tsx watch peut conserver une instance {@link PrismaClient} créée avant `prisma generate`.
 * Dans ce cas, des modèles récents sont absents : on recrée le client après déconnexion du vieux.
 */
function ensureFreshClient(): PrismaClient {
  if (hasStayPromoDelegate(prismaSingleton) && hasAncillaryFeeDelegate(prismaSingleton)) return prismaSingleton;

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
