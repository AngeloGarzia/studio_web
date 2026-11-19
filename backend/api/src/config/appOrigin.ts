import { getEnv } from "./env.js";

/** Liste des origines front autorisées (APP_ORIGIN, séparées par des virgules). */
export function getAppOrigins(): string[] {
  return getEnv()
    .APP_ORIGIN.split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/** Origine canonique (liens mails, redirects) = première entrée de APP_ORIGIN. */
export function getPrimaryAppOrigin(): string {
  return getAppOrigins()[0] ?? "http://localhost:5173";
}
