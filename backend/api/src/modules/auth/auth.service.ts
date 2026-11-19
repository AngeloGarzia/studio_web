import { getPrimaryAppOrigin } from "../../config/appOrigin.js";
import { signAuthToken } from "../../middleware/auth.js";
import { AppError } from "../../shared/http.js";
import { hashPassword, hashSetupToken, makeSetupToken, normalizeEmail, verifyPassword } from "../../shared/password.js";
import type { AppRole } from "../../shared/roles.js";
import type { MailService } from "../mail/mail.service.js";
import type { AuthRepository } from "./auth.repository.js";
import type { ForgotPasswordBody, LoginBody, RegisterBody, SetupPasswordBody } from "./auth.dto.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type AuthUserView = {
  id: string;
  email: string;
  role: AppRole;
  profileName: string | null;
  phone?: string | null;
};

export type AuthSessionResult = {
  user: AuthUserView;
  token: string;
};

function toView(user: {
  id: string;
  email: string;
  role: AppRole;
  profileName: string | null;
  phone?: string | null;
}): AuthUserView {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    profileName: user.profileName,
    phone: user.phone
  };
}

export class AuthService {
  constructor(
    private readonly users: AuthRepository,
    private readonly mail: MailService
  ) {}

  async login(body: LoginBody): Promise<AuthSessionResult> {
    const email = normalizeEmail(body.email);
    const user = await this.users.findByEmailNormalized(email);

    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppError("ACCOUNT_LOCKED", 423);
    }

    // Toujours comparer (hash fictif si inconnu) pour limiter le timing oracle.
    const ok = await verifyPassword(body.password, user?.passwordHash);

    if (!user || !ok || user.isGuest) {
      if (user && !user.isGuest) {
        const attempts = user.failedLoginAttempts + 1;
        const lockedUntil =
          attempts >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCK_MINUTES * 60_000)
            : null;
        await this.users.recordFailedLogin(user.id, attempts >= MAX_FAILED_ATTEMPTS ? 0 : attempts, lockedUntil);
        if (lockedUntil) throw new AppError("ACCOUNT_LOCKED", 423);
      }
      // Compte guest : même message que credentials invalides (pas d’énumération).
      throw new AppError("INVALID_CREDENTIALS", 401);
    }

    await this.users.clearLoginFailures(user.id);
    const token = signAuthToken({ sub: user.id, role: user.role, email: user.email });
    return { user: toView(user), token };
  }

  async register(body: RegisterBody, anonUserId?: string): Promise<AuthSessionResult> {
    const email = normalizeEmail(body.email);
    const existing = await this.users.findByEmailNormalized(email);

    if (existing) {
      // Claim guest uniquement : même cookie anon + compte encore isGuest + email exact.
      const canClaim =
        existing.isGuest &&
        existing.role === "CLIENT" &&
        typeof anonUserId === "string" &&
        anonUserId === existing.id;

      if (!canClaim) throw new AppError("EMAIL_TAKEN", 409);

      const passwordHash = await hashPassword(body.password);
      const user = await this.users.claimGuest(existing.id, {
        email,
        passwordHash,
        profileName: body.profileName,
        phone: body.phone
      });
      const token = signAuthToken({ sub: user.id, role: user.role, email: user.email });
      return { user: toView(user), token };
    }

    const passwordHash = await hashPassword(body.password);
    const user = await this.users.createClient({
      email,
      passwordHash,
      profileName: body.profileName,
      phone: body.phone,
      isGuest: false
    });
    const token = signAuthToken({ sub: user.id, role: user.role, email: user.email });
    return { user: toView(user), token };
  }

  async setupPassword(body: SetupPasswordBody): Promise<AuthSessionResult> {
    const user = await this.users.findByPasswordSetupHash(hashSetupToken(body.token));
    if (!user || user.isGuest || !user.passwordSetupExpires) throw new AppError("TOKEN_INVALID", 400);
    if (user.passwordSetupExpires.getTime() < Date.now()) throw new AppError("TOKEN_EXPIRED", 400);
    const updated = await this.users.completePasswordSetup(user.id, await hashPassword(body.password));
    const token = signAuthToken({ sub: updated.id, role: updated.role, email: updated.email });
    return { user: toView(updated), token };
  }

  /**
   * Envoie un lien de réinitialisation si le compte existe.
   * Réponse toujours ok (pas d’énumération d’emails).
   */
  async forgotPassword(body: ForgotPasswordBody): Promise<{ ok: true }> {
    const email = normalizeEmail(body.email);
    const user = await this.users.findByEmailNormalized(email);
    if (user && !user.isGuest) {
      const setup = makeSetupToken();
      const expires = new Date(Date.now() + 2 * 60 * 60 * 1000);
      await this.users.setPasswordSetup(user.id, setup.hash, expires);
      const resetUrl = `${getPrimaryAppOrigin()}/choisir-mot-de-passe?token=${setup.token}`;
      try {
        await this.mail.sendPasswordReset({
          to: user.email,
          name: user.profileName?.trim() || "",
          resetUrl
        });
      } catch (e) {
        if (e instanceof Error && e.name === "MAIL_DISABLED") throw new AppError("MAIL_DISABLED", 503);
        throw e;
      }
    }
    return { ok: true };
  }

  async me(userId: string): Promise<AuthUserView> {
    const user = await this.users.findById(userId);
    if (!user || user.isGuest) throw new AppError("UNAUTHENTICATED", 401);
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppError("ACCOUNT_LOCKED", 423);
    }
    return toView(user);
  }
}
