import React from "react";
import { api } from "../lib/api";

type Ancillary = { id: string; label: string; priceCents: number };

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
