import type { PrismaClient, User } from "@prisma/client";

export type AuthUserRow = Pick<
  User,
  | "id"
  | "email"
  | "passwordHash"
  | "role"
  | "profileName"
  | "phone"
  | "isGuest"
  | "failedLoginAttempts"
  | "lockedUntil"
>;

export interface AuthRepository {
  findByEmailNormalized(email: string): Promise<AuthUserRow | null>;
  findById(id: string): Promise<AuthUserRow | null>;
  createClient(data: {
    email: string;
    passwordHash: string;
    profileName?: string | null;
    phone?: string | null;
    isGuest?: boolean;
  }): Promise<AuthUserRow>;
  claimGuest(
    id: string,
    data: { passwordHash: string; profileName?: string; phone?: string; email: string }
  ): Promise<AuthUserRow>;
  recordFailedLogin(id: string, failedLoginAttempts: number, lockedUntil: Date | null): Promise<void>;
  clearLoginFailures(id: string): Promise<void>;
  findByPasswordSetupHash(hash: string): Promise<(AuthUserRow & { passwordSetupExpires: Date | null }) | null>;
  completePasswordSetup(id: string, passwordHash: string): Promise<AuthUserRow>;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByEmailNormalized(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        profileName: true,
        phone: true,
        isGuest: true,
        failedLoginAttempts: true,
        lockedUntil: true
      }
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        profileName: true,
        phone: true,
        isGuest: true,
        failedLoginAttempts: true,
        lockedUntil: true
      }
    });
  }

  createClient(data: {
    email: string;
    passwordHash: string;
    profileName?: string | null;
    phone?: string | null;
    isGuest?: boolean;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        role: "CLIENT",
        isGuest: data.isGuest ?? false,
        profileName: data.profileName ?? undefined,
        phone: data.phone ?? undefined
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        profileName: true,
        phone: true,
        isGuest: true,
        failedLoginAttempts: true,
        lockedUntil: true
      }
    });
  }

  claimGuest(
    id: string,
    data: { passwordHash: string; profileName?: string; phone?: string; email: string }
  ) {
    return this.prisma.user.update({
      where: { id },
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        isGuest: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(data.profileName?.trim() ? { profileName: data.profileName.trim() } : {}),
        ...(data.phone?.trim() ? { phone: data.phone.trim() } : {})
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        profileName: true,
        phone: true,
        isGuest: true,
        failedLoginAttempts: true,
        lockedUntil: true
      }
    });
  }

  async recordFailedLogin(id: string, failedLoginAttempts: number, lockedUntil: Date | null) {
    await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts, lockedUntil }
    });
  }

  async clearLoginFailures(id: string) {
    await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null }
    });
  }

  findByPasswordSetupHash(hash: string) {
    return this.prisma.user.findUnique({
      where: { passwordSetupTokenHash: hash },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        profileName: true,
        phone: true,
        isGuest: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        passwordSetupExpires: true
      }
    });
  }

  completePasswordSetup(id: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordSetupTokenHash: null,
        passwordSetupExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        isGuest: false
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        profileName: true,
        phone: true,
        isGuest: true,
        failedLoginAttempts: true,
        lockedUntil: true
      }
    });
  }
}
