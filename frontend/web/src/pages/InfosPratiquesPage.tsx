import React from "react";
import { api } from "../lib/api";

type Ancillary = { id: string; label: string; priceCents: number };

function mapQuery(address: string) {
  const raw = address.replace(/\s+/g, " ").trim();
  if (/\d{5}|balaruc/i.test(raw)) return raw;
  return `${raw}, 34540 Balaruc-les-Bains, France`;
}

function PropertyMap({ address, title }: { address: string; title: string }) {
  const query = mapQuery(address);
  const [point, setPoint] = React.useState<{ lat: number; lon: number } | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const ctrl = new AbortController();
    setPoint(null);
    setFailed(false);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("map"))))
      .then((rows: Array<{ lat?: string; lon?: string }>) => {
        const hit = rows[0];
        const lat = Number(hit?.lat);
        const lon = Number(hit?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          setFailed(true);
          return;
        }
        setPoint({ lat, lon });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setFailed(true);
      });
    return () => ctrl.abort();
  }, [query]);

  const delta = 0.008;
  const src = point
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${point.lon - delta}%2C${point.lat - delta}%2C${point.lon + delta}%2C${point.lat + delta}&layer=mapnik&marker=${point.lat}%2C${point.lon}`
    : null;
  const openHref = point
    ? `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=17/${point.lat}/${point.lon}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;

  return (
    <div className="sdg-card mt-6 p-4 md:p-5">
      <div className="text-sm font-extrabold tracking-tight text-slate-900">Lieu du bien</div>
      <p className="mt-1 text-sm text-slate-600">{title}</p>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50">
        {src ? (
          <iframe
            title={`Carte : ${query}`}
            src={src}
            className="h-72 w-full md:h-96"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex h-72 items-center justify-center px-4 text-center text-sm text-slate-600 md:h-96">
            {failed ? "La carte n’a pas pu être chargée." : "Chargement de la carte…"}
          </div>
        )}
      </div>
      <a
        className="mt-3 inline-flex text-sm font-semibold text-water-700 underline decoration-water-400/60 hover:text-water-900"
        href={openHref}
        target="_blank"
        rel="noreferrer"
      >
        Ouvrir la carte
      </a>
    </div>
  );
}

export function InfosPratiquesPage() {
  const [settings, setSettings] = React.useState<any>(null);
  const [fees, setFees] = React.useState<Ancillary[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      setErr(null);
      try {
        const [s, f] = await Promise.all([api.publicSettings(), api.publicAncillaryFees().catch(() => [])]);
        setSettings(s);
        setFees(Array.isArray(f) ? f : []);
      } catch (e: any) {
        setErr(e?.error ?? "Impossible de charger les informations.");
      }
    })();
  }, []);

  const studio = settings?.studioName ?? "Studio des Grenadiers";

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Infos pratiques</h1>
      <p className="sdg-subtitle mt-2">Contact, adresse du bien et frais annexes pour ta réservation.</p>

      {err ? (
        <div className="sdg-card mt-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{err}</div>
      ) : null}

      <div className="sdg-card mt-6 p-4 md:p-5">
        <div className="text-sm font-extrabold tracking-tight text-slate-900">Propriétaire & contact</div>
        <dl className="mt-4 space-y-3 text-sm text-slate-800">
          <div>
            <dt className="font-semibold text-slate-600">Identité du propriétaire</dt>
            <dd className="mt-0.5 text-base font-semibold text-slate-900">
              {settings?.ownerName?.trim() ? settings.ownerName.trim() : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-600">Téléphone</dt>
            <dd className="mt-0.5">
              {settings?.phone?.trim() ? (
                <a className="font-semibold text-water-700 underline decoration-water-400/60 hover:text-water-900" href={`tel:${settings.phone.replace(/\s/g, "")}`}>
                  {settings.phone.trim()}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-600">E-mail</dt>
            <dd className="mt-0.5">
              {settings?.publicEmail?.trim() ? (
                <a className="font-semibold text-water-700 underline decoration-water-400/60 hover:text-water-900" href={`mailto:${settings.publicEmail.trim()}`}>
                  {settings.publicEmail.trim()}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="sdg-card mt-6 p-4 md:p-5">
        <div className="text-sm font-extrabold tracking-tight text-slate-900">Adresse du bien</div>
        <dl className="mt-4 space-y-3 text-sm text-slate-800">
          <div>
            <dt className="font-semibold text-slate-600">Nom du logement</dt>
            <dd className="mt-0.5 text-base font-semibold text-slate-900">{studio}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-600">Adresse</dt>
            <dd className="mt-0.5 whitespace-pre-line">{settings?.address?.trim() ? settings.address.trim() : "—"}</dd>
          </div>
          {settings?.lodgingType || settings?.surfaceM2 != null ? (
            <div>
              <dt className="font-semibold text-slate-600">Type & surface</dt>
              <dd className="mt-0.5">
                {[settings?.lodgingType, settings?.surfaceM2 != null ? `${settings.surfaceM2} m²` : null].filter(Boolean).join(" · ") || "—"}
              </dd>
            </div>
          ) : null}
          {settings?.checkInTime || settings?.checkOutTime ? (
            <div>
              <dt className="font-semibold text-slate-600">Horaires</dt>
              <dd className="mt-0.5">
                {settings?.checkInTime ? <>Arrivée : {settings.checkInTime}</> : null}
                {settings?.checkInTime && settings?.checkOutTime ? " · " : null}
                {settings?.checkOutTime ? <>Départ : {settings.checkOutTime}</> : null}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {settings?.address?.trim() ? <PropertyMap address={settings.address.trim()} title={studio} /> : null}

      <div className="sdg-card mt-6 p-4 md:p-5">
        <div className="text-sm font-extrabold tracking-tight text-slate-900">Frais annexes</div>
        <p className="mt-1 text-sm text-slate-600">
          Montants ajoutés au total du séjour lors d’une demande de réservation (hors promos sur les nuitées).
        </p>
        {fees.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">Aucun frais annexes actif pour le moment.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200/80 rounded-2xl border border-slate-200/90 bg-white/60">
            {fees.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-900">{f.label}</span>
                <span className="shrink-0 tabular-nums font-extrabold text-slate-900">{(Math.round(f.priceCents) / 100).toFixed(0)} €</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
