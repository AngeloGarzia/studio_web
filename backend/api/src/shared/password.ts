import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const BCRYPT_ROUNDS = 12;

/** Politique mot de passe : 10+ caractères, au moins une lettre et un chiffre. */
export const PasswordSchema = z
  .string()
  .min(10, "PASSWORD_TOO_SHORT")
  .max(128, "PASSWORD_TOO_LONG")
  .regex(/[A-Za-z]/, "PASSWORD_NEED_LETTER")
  .regex(/[0-9]/, "PASSWORD_NEED_DIGIT");

/** Hash fictif pour égaliser le timing login quand l’email est inconnu. */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("timing-dummy-not-a-real-password", BCRYPT_ROUNDS);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined): Promise<boolean> {
  const hash = passwordHash && passwordHash.length > 0 ? passwordHash : DUMMY_PASSWORD_HASH;
  return bcrypt.compare(password, hash);
}

/** Mot de passe temporaire envoyé à la création du compte (lettre + chiffre, 12 caractères). */
export function makeTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let body = "";
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  return `Sd${body}7`;
}

export function makeSetupToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashSetupToken(token) };
}

export function hashSetupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mot de passe aléatoire non utilisable pour les comptes guest. */
export async function hashRandomGuestPassword(): Promise<string> {
  const raw = `${Math.random().toString(36)}${Date.now().toString(36)}${Math.random().toString(36)}`;
  return hashPassword(raw);
}
