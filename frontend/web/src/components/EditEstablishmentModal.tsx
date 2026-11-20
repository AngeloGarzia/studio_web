import React from "react";
import { api, mediaUrl } from "../lib/api";

export type EditableEstablishment = {
  id: string;
  name: string;
  rentalKind: "FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY";
  monthlyRentCents: number;
  monthlyChargesCents: number;
  address: string | null;
  city: string;
  description: string;
  coverMediaId: string | null;
  isVisible: boolean;
};

type RentalKind = EditableEstablishment["rentalKind"];

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function parseEuroToCents(raw: string): number | null {
  const n = Number(String(raw).trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100);
}

function messageOf(e: unknown) {
  const code = e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "Erreur";
  if (code === "COVER_NOT_FOUND") return "Choisis une photo publiée de cet établissement.";
  if (code === "HAS_TENANTS") return "Retire les locataires avant de passer cet établissement en meublé de tourisme.";
  if (code === "VALIDATION_ERROR") return "Certaines informations saisies ne sont pas valides.";
  return code;
}

export function EditEstablishmentModal({
  establishment,
  onClose,
  onSaved
}: {
  establishment: EditableEstablishment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(establishment.name);
  const [kind, setKind] = React.useState<RentalKind>(establishment.rentalKind);
  const [address, setAddress] = React.useState(establishment.address ?? "");
  const [city, setCity] = React.useState(establishment.city ?? "");
  const [description, setDescription] = React.useState(establishment.description ?? "");
  const [coverMediaId, setCoverMediaId] = React.useState<string | null>(establishment.coverMediaId);
  const [isVisible, setIsVisible] = React.useState(establishment.isVisible);
  const [images, setImages] = React.useState<Array<{ id: string; title: string | null; thumbUrl: string }>>([]);
  const [rentInput, setRentInput] = React.useState(centsToInput(establishment.monthlyRentCents));
  const [chargesInput, setChargesInput] = React.useState(centsToInput(establishment.monthlyChargesCents));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setName(establishment.name);
    setKind(establishment.rentalKind);
    setAddress(establishment.address ?? "");
    setCity(establishment.city ?? "");
    setDescription(establishment.description ?? "");
    setCoverMediaId(establishment.coverMediaId);
    setIsVisible(establishment.isVisible);
    setRentInput(centsToInput(establishment.monthlyRentCents));
    setChargesInput(centsToInput(establishment.monthlyChargesCents));
    setError(null);
  }, [establishment]);

  React.useEffect(() => {
    void api.adminEstablishmentImages(establishment.id).then(setImages).catch(() => setImages([]));
  }, [establishment.id]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Indique le nom de l’établissement.");
      return;
    }
    const rentCents = parseEuroToCents(rentInput);
    const chargesCents = parseEuroToCents(chargesInput);
    if (kind === "UNFURNISHED_MONTHLY" && (rentCents == null || chargesCents == null)) {
      setError("Le loyer et les charges doivent être des montants valides.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminUpdateEstablishment(establishment.id, {
        name: trimmed,
        address,
        city,
        description,
        coverMediaId,
        rentalKind: kind,
        isVisible,
        ...(kind === "UNFURNISHED_MONTHLY" ? { monthlyRentCents: rentCents ?? 0, monthlyChargesCents: chargesCents ?? 0 } : {})
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-establishment-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="edit-establishment-title" className="text-lg font-bold text-slate-900">
            Modifier l’établissement
          </h2>
          <button type="button" className="sdg-btn-soft" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3">
          <label className="text-sm font-semibold text-slate-700">
            Nom
            <input className="sdg-input mt-1" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Type
            <select className="sdg-input mt-1" value={kind} onChange={(e) => setKind(e.target.value as RentalKind)}>
              <option value="FURNISHED_TOURISM">Meublé de tourisme</option>
              <option value="UNFURNISHED_MONTHLY">Logement loué vide au mois</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Ville
            <input className="sdg-input mt-1" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Adresse
            <input className="sdg-input mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Descriptif
            <textarea className="sdg-input mt-1 min-h-28" value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} />
            <span className="mt-1 block text-xs font-normal text-slate-500">L’accueil en montre un résumé pour les visiteurs non connectés.</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-water-600"
              checked={isVisible}
              onChange={(e) => setIsVisible(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Visible sur l’accueil</span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                Si décoché, les visiteurs ne voient plus ce logement sur la page d’accueil (catalogue, anneau, carte).
              </span>
            </span>
          </label>
          <div>
            <p className="text-sm font-semibold text-slate-700">Image d’accroche</p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold ${coverMediaId ? "border-slate-200 text-slate-600" : "border-water-600 bg-water-50 text-water-900"}`}
                onClick={() => setCoverMediaId(null)}
              >
                Aucune
              </button>
              {images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 ${coverMediaId === image.id ? "border-water-600" : "border-transparent"}`}
                  onClick={() => setCoverMediaId(image.id)}
                >
                  <img src={mediaUrl(image.thumbUrl)} alt={image.title?.trim() || "Photo du logement"} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            {images.length === 0 ? <p className="mt-1 text-xs text-slate-500">Publie une photo dans les médias de ce logement pour l’utiliser ici.</p> : null}
          </div>
          {kind === "UNFURNISHED_MONTHLY" ? (
            <>
              <label className="text-sm font-semibold text-slate-700">
                Loyer hors charges (€)
                <input className="sdg-input mt-1" inputMode="decimal" value={rentInput} onChange={(e) => setRentInput(e.target.value)} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Provisions pour charges (€)
                <input className="sdg-input mt-1" inputMode="decimal" value={chargesInput} onChange={(e) => setChargesInput(e.target.value)} />
              </label>
            </>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="sdg-btn-primary" disabled={busy} onClick={() => void save()}>
            Enregistrer
          </button>
          <button type="button" className="sdg-btn-soft" disabled={busy} onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
