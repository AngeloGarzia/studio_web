import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { getEnv } from "../config/env.js";

export async function ensureAdmin(prisma: PrismaClient): Promise<void> {
  const env = getEnv();
  let admin = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
  if (!admin) {
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
    admin = await prisma.user.create({
      data: { email: env.ADMIN_EMAIL, passwordHash, role: "ADMIN", profileName: "Admin" }
    });
  }

  let establishment =
    (await prisma.establishment.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.establishment.findFirst({ orderBy: { createdAt: "asc" } }));

  if (!establishment) {
    establishment = await prisma.establishment.create({
      data: {
        name: "Studio des Grenadiers",
        isDefault: true,
        settings: { create: { studioName: "Studio des Grenadiers", equipments: [] } }
      }
    });
  }

  await prisma.establishmentMember.upsert({
    where: { userId_establishmentId: { userId: admin.id, establishmentId: establishment.id } },
    create: { userId: admin.id, establishmentId: establishment.id },
    update: {}
  });

  const trimmedName = admin.profileName?.trim() ?? "";
  const space = trimmedName.indexOf(" ");
  const firstName = space > 0 ? trimmedName.slice(0, space) : "";
  const lastName = space > 0 ? trimmedName.slice(space + 1).trim() : trimmedName || admin.email.split("@")[0] || "Propriétaire";
  const owner = await prisma.owner.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, firstName, lastName, email: admin.email, phone: admin.phone },
    update: {}
  });
  await prisma.establishmentOwner.upsert({
    where: { ownerId_establishmentId: { ownerId: owner.id, establishmentId: establishment.id } },
    create: { ownerId: owner.id, establishmentId: establishment.id },
    update: {}
  });

  if (!admin.activeEstablishmentId) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { activeEstablishmentId: establishment.id }
    });
  }
}
