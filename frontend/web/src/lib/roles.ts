export type AppRole = "ADMIN" | "OWNER" | "CLIENT";

/** Admin ou propriétaire : gestion du logement. */
export function isManagerRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "OWNER";
}
