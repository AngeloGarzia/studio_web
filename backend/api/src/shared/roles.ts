export const APP_ROLES = ["ADMIN", "OWNER", "CLIENT"] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Admin ou propriétaire : gestion du logement. */
export function isManagerRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "OWNER";
}
