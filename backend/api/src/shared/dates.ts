/** Clé yyyy-mm-dd en UTC pour les séjours (alignée sur Booking / DayConfig). */
export function bookingNightKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Jours YYYY-MM-DD de `fromYmd` à `toYmd` inclus (UTC, pas d’entrée si range invalide). */
export function inclusiveUtcNightKeys(fromYmd: string, toYmd: string): string[] {
  const keys: string[] = [];
  let anchor = Date.parse(`${fromYmd}T12:00:00.000Z`);
  const endAnchor = Date.parse(`${toYmd}T12:00:00.000Z`);
  if (!Number.isFinite(anchor) || !Number.isFinite(endAnchor) || endAnchor < anchor) return keys;
  for (; anchor <= endAnchor; anchor += 86400000) {
    keys.push(new Date(anchor).toISOString().slice(0, 10));
  }
  return keys;
}
