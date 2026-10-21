import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "./http.js";

const storage = new AsyncLocalStorage<{ establishmentId: string }>();

export function runWithEstablishment<T>(establishmentId: string, fn: () => T): T {
  return storage.run({ establishmentId }, fn);
}

/** Établissement de la requête en cours. Toutes les données métier en dépendent. */
export function currentEstablishmentId(): string {
  const id = storage.getStore()?.establishmentId;
  if (!id) throw new AppError("NO_ESTABLISHMENT", 503);
  return id;
}
