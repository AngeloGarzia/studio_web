export type GeoPoint = { latitude: number; longitude: number };

/**
 * Géocode une adresse via Nominatim (OpenStreetMap).
 * Retourne null si vide, échec réseau, ou aucun résultat.
 */
export async function geocodeAddress(parts: { address?: string | null; city?: string | null }): Promise<GeoPoint | null> {
  const query = [parts.address?.trim(), parts.city?.trim(), "France"].filter(Boolean).join(", ");
  if (!query || query === "France") return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "fr");

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "StudioDesGrenadiers/1.0 (balaruc.fr; contact@balaruc.fr)"
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = rows[0];
    if (!first?.lat || !first?.lon) return null;
    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}
