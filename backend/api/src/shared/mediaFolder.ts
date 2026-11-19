import { randomInt } from "node:crypto";

/** Dossier S3 : nom d’établissement assaini + 16 chiffres uniques. */
export function buildMediaFolder(establishmentName: string): string {
  const base =
    establishmentName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "etablissement";
  return `${base}_${random16Digits()}`;
}

function random16Digits(): string {
  let out = "";
  while (out.length < 16) {
    out += String(randomInt(0, 10));
  }
  return out.slice(0, 16);
}
