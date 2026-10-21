import React from "react";
import { api } from "../../lib/api";

type AncillaryFeeRow = { id: string; label: string; priceCents: number; sortOrder: number; active: boolean };

type RentalKind = "FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY";

type OwnerCard = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null };

type ActiveEstablishment = {
  id: string;
  name: string;
  rentalKind: RentalKind;
  owners: OwnerCard[];
};

function ownerLine(owner: OwnerCard) {
  const name = `${owner.firstName} ${owner.lastName}`.trim();
  return [name, owner.email, owner.phone].filter(Boolean).join(" · ");
}

function settingsMessage(e: unknown) {
  const code = e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "Erreur";
  const issues =
    e && typeof e === "object" && "issues" in e && Array.isArray((e as { issues: unknown }).issues)
      ? (e as { issues: Array<{ path?: unknown }> }).issues
      : [];
  if (code === "VALIDATION_ERROR" && issues.some((issue) => Array.isArray(issue.path) && issue.path.includes("email"))) {
    return "L’e-mail n’est pas valide. Laisse le champ vide, ou indique une adresse complète.";
  }
  if (code === "HAS_TENANTS") return "Retire les locataires avant de passer cet établissement en meublé de tourisme.";
  if (code === "LAST_OWNER") return "Un établissement doit garder au moins un propriétaire.";
  if (code === "QUITTANCE_LINKED") return "Cette personne figure sur une quittance déjà envoyée.";
  if (code === "ALREADY_OWNER") return "Ce propriétaire est déjà rattaché à cet établissement.";
  return code;
}

function OwnerCreateModal({
  busy,
  onClose,
  onCreate
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (payload: { firstName: string; lastName: string; email: string; phone: string }) => Promise<void>;
}) {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (!lastName.trim()) {
      setError("Indique le nom du propriétaire.");
      return;
    }
    setError(null);
    try {
      await onCreate({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() });
    } catch (e: unknown) {
      setError(settingsMessage(e));
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-create-title"
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="owner-create-title" className="text-lg font-bold text-slate-900">
          Nouveau propriétaire
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Prénom
            <input className="sdg-input mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Nom
            <input className="sdg-input mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            E-mail
            <input className="sdg-input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Téléphone
            <input className="sdg-input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="sdg-btn-primary" disabled={busy} onClick={() => void submit()}>
            Créer et rattacher
          </button>
          <button type="button" className="sdg-btn-soft" disabled={busy} onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

function euroInputToCents(raw: string): number | null {
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return null;
  return Math.round(n * 100);
}

function AncillaryFeeRowEditor({ row, onDone }: { row: AncillaryFeeRow; onDone: () => void }) {
  const [label, setLabel] = React.useState(row.label);
  const [euros, setEuros] = React.useState(String(Math.round(row.priceCents) / 100));
  const [sortOrder, setSortOrder] = React.useState(String(row.sortOrder));
  const [active, setActive] = React.useState(row.active);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLabel(row.label);
    setEuros(String(Math.round(row.priceCents) / 100));
    setSortOrder(String(row.sortOrder));
    setActive(row.active);
  }, [row]);

  const save = async () => {
    setMsg(null);
    const cents = euroInputToCents(euros);
    if (cents == null) {
      setMsg("Montant invalide.");
      return;
    }
    if (!label.trim()) {
      setMsg("Libellé requis.");
      return;
    }
    try {
      await api.adminUpdateAncillaryFee(row.id, {
        label: label.trim(),
        priceCents: cents,
        sortOrder: Number.parseInt(sortOrder, 10) || 0,
        active
      });
      onDone();
    } catch (e: any) {
      setMsg(e?.error ?? "Erreur");
    }
  };

  const del = async () => {
    if (!window.confirm("Supprimer ce frais ?")) return;
    setMsg(null);
    try {
      await api.adminDeleteAncillaryFee(row.id);
      onDone();
    } catch (e: any) {
      setMsg(e?.error ?? "Erreur");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 md:p-4">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-end">
        <div className="md:col-span-5">
          <label className="sdg-label">Libellé</label>
          <input className="sdg-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Ménage fin de séjour" />
        </div>
        <div className="md:col-span-2">
          <label className="sdg-label">Montant (€)</label>
          <input className="sdg-input" value={euros} onChange={(e) => setEuros(e.target.value)} inputMode="decimal" />
        </div>
        <div className="md:col-span-2">
          <label className="sdg-label">Ordre</label>
          <input className="sdg-input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
        </div>
        <label className="flex items-center gap-2 md:col-span-1">
          <input type="checkbox" className="h-4 w-4 accent-water-600" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span className="text-sm font-semibold text-slate-800">Actif</span>
        </label>
        <div className="flex flex-wrap gap-2 md:col-span-2 md:justify-end">
          <button type="button" className="sdg-btn-primary" onClick={() => void save()}>
            Enregistrer
          </button>
          <button type="button" className="sdg-btn-danger" onClick={() => void del()}>
            Supprimer
          </button>
        </div>
      </div>
      {msg ? <div className="mt-2 text-sm font-semibold text-rose-700">{msg}</div> : null}
    </div>
  );
}

export function AdminSettingsPage() {
  const [model, setModel] = React.useState<any>({
    studioName: "Studio des Grenadiers",
    heroPoints:
      "Réservations en direct propriétaire\nPrise de contact téléphonique\nContrat et bail envoyés par la poste\n100 % humain",
    ownerName: "",
    address: "",
    city: "",
    phone: "",
    publicEmail: "",
    lodgingType: "",
    surfaceM2: "",
    socialLinks: [],
    equipments: [],
    minNights: 1,
    checkInTime: "",
    checkOutTime: "",
    bookingAutoConfirm: false,
    maintenanceMode: false
  });
  const [status, setStatus] = React.useState<string | null>(null);
  const [equipInput, setEquipInput] = React.useState("");
  const [socialLabel, setSocialLabel] = React.useState("");
  const [socialUrl, setSocialUrl] = React.useState("");

  const [ancillaryFees, setAncillaryFees] = React.useState<AncillaryFeeRow[]>([]);
  const [ancillaryStatus, setAncillaryStatus] = React.useState<string | null>(null);
  const [newAncLabel, setNewAncLabel] = React.useState("");
  const [newAncEuro, setNewAncEuro] = React.useState("");
  const [newAncSort, setNewAncSort] = React.useState("0");

  const [activeEstablishment, setActiveEstablishment] = React.useState<ActiveEstablishment | null>(null);
  const [ownerCatalog, setOwnerCatalog] = React.useState<OwnerCard[]>([]);
  const [rentalKind, setRentalKind] = React.useState<RentalKind>("FURNISHED_TOURISM");
  const [ownerPick, setOwnerPick] = React.useState("");
  const [ownerStatus, setOwnerStatus] = React.useState<string | null>(null);
  const [ownerBusy, setOwnerBusy] = React.useState(false);
  const [createOwnerOpen, setCreateOwnerOpen] = React.useState(false);

  const reloadAncillaryFees = React.useCallback(async () => {
    try {
      const rows = await api.adminAncillaryFees();
      setAncillaryFees(Array.isArray(rows) ? (rows as AncillaryFeeRow[]) : []);
    } catch {
      setAncillaryFees([]);
    }
  }, []);

  React.useEffect(() => {
    void reloadAncillaryFees();
  }, [reloadAncillaryFees]);

  const reloadEstablishment = React.useCallback(async () => {
    const [rows, people] = await Promise.all([api.adminEstablishments(), api.adminOwners()]);
    const current = rows.find((row) => row.active) ?? rows[0] ?? null;
    setActiveEstablishment(
      current
        ? { id: current.id, name: current.name, rentalKind: current.rentalKind, owners: current.owners ?? [] }
        : null
    );
    setRentalKind(current?.rentalKind ?? "FURNISHED_TOURISM");
    setOwnerCatalog(people);
    return current;
  }, []);

  React.useEffect(() => {
    void reloadEstablishment().catch(() => undefined);
  }, [reloadEstablishment]);

  const syncPublicOwnerName = async (owners: OwnerCard[]) => {
    const ownerName = owners
      .map((owner) => `${owner.firstName} ${owner.lastName}`.trim())
      .filter(Boolean)
      .join(", ");
    await api.adminSaveSettings({ ownerName: ownerName || null });
    setModel((prev: { ownerName?: string }) => ({ ...prev, ownerName }));
  };

  const changeRentalKind = async (next: RentalKind) => {
    if (!activeEstablishment) return;
    const previous = rentalKind;
    setRentalKind(next);
    setOwnerStatus(null);
    setOwnerBusy(true);
    try {
      await api.adminUpdateEstablishment(activeEstablishment.id, { rentalKind: next });
      setActiveEstablishment({ ...activeEstablishment, rentalKind: next });
    } catch (e: unknown) {
      setRentalKind(previous);
      setOwnerStatus(settingsMessage(e));
    } finally {
      setOwnerBusy(false);
    }
  };

  const attachOwner = async (ownerId: string) => {
    if (!activeEstablishment) return;
    setOwnerBusy(true);
    setOwnerStatus(null);
    try {
      await api.adminAttachOwner(activeEstablishment.id, ownerId);
      const current = await reloadEstablishment();
      const owners = current?.owners ?? [];
      await syncPublicOwnerName(owners);
      setOwnerPick("");
      setCreateOwnerOpen(false);
    } catch (e: unknown) {
      setOwnerStatus(settingsMessage(e));
    } finally {
      setOwnerBusy(false);
    }
  };

  const createAndAttachOwner = async (payload: { firstName: string; lastName: string; email: string; phone: string }) => {
    if (!activeEstablishment) return;
    setOwnerBusy(true);
    try {
      const created = await api.adminCreateOwner(payload);
      await api.adminAttachOwner(activeEstablishment.id, created.id);
      const current = await reloadEstablishment();
      await syncPublicOwnerName(current?.owners ?? []);
      setOwnerPick("");
      setCreateOwnerOpen(false);
    } finally {
      setOwnerBusy(false);
    }
  };

  React.useEffect(() => {
    void (async () => {
      const s = await api.adminGetSettings().catch(() => null);
      if (s) {
        setModel((prev: any) => ({
          ...prev,
          ...s
        }));
      }
    })();
  }, []);

  const save = async () => {
    setStatus(null);
    const emailRaw = String(model.publicEmail ?? "").trim();
    const surfaceRaw = String(model.surfaceM2 ?? "").trim();
    const surfaceM2 = surfaceRaw === "" ? null : Number(surfaceRaw);
    const minNights = Number(model.minNights);
    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      setStatus("Erreur: l’email public doit être une adresse valide (ex. contact@domaine.fr).");
      return;
    }
    if (surfaceRaw !== "" && (!Number.isFinite(surfaceM2) || (surfaceM2 as number) < 0)) {
      setStatus("Erreur: surface (m²) invalide.");
      return;
    }
    if (!Number.isFinite(minNights) || minNights < 1) {
      setStatus("Erreur: nuits minimum invalide.");
      return;
    }
    try {
      await api.adminSaveSettings({
        studioName: String(model.studioName ?? "").trim() || "Studio des Grenadiers",
        heroPoints: String(model.heroPoints ?? ""),
        ownerName: String(model.ownerName ?? "").trim() || null,
        address: String(model.address ?? "").trim() || null,
        city: String(model.city ?? "").trim() || null,
        phone: String(model.phone ?? "").trim() || null,
        publicEmail: emailRaw || null,
        lodgingType: String(model.lodgingType ?? "").trim() || null,
        surfaceM2,
        equipments: Array.isArray(model.equipments) ? model.equipments : [],
        socialLinks: Array.isArray(model.socialLinks) ? model.socialLinks : [],
        minNights,
        checkInTime: String(model.checkInTime ?? "").trim() || null,
        checkOutTime: String(model.checkOutTime ?? "").trim() || null,
        bookingAutoConfirm: Boolean(model.bookingAutoConfirm),
        maintenanceMode: Boolean(model.maintenanceMode)
      });
      const s = await api.adminGetSettings().catch(() => null);
      if (s) {
        setModel((prev: any) => ({
          ...prev,
          ...s,
          ownerName: s.ownerName ?? "",
          address: s.address ?? "",
          city: s.city ?? "",
          phone: s.phone ?? "",
          publicEmail: s.publicEmail ?? "",
          lodgingType: s.lodgingType ?? "",
          surfaceM2: s.surfaceM2 ?? "",
          checkInTime: s.checkInTime ?? "",
          checkOutTime: s.checkOutTime ?? "",
          socialLinks: Array.isArray(s.socialLinks) ? s.socialLinks : []
        }));
      }
      setStatus("Enregistré.");
    } catch (e: any) {
      const issue = Array.isArray(e?.issues) && e.issues[0] ? `${e.issues[0].path?.join(".")}: ${e.issues[0].message}` : null;
      setStatus(`Erreur: ${issue ?? e?.error ?? "UNKNOWN"}`);
    }
  };

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Admin — Paramètres</h1>
      <p className="sdg-subtitle mt-2">Informations publiques + règles de réservation.</p>

      <div className="sdg-card mt-6 p-4 md:p-5">
        <h2 className="text-lg font-extrabold text-slate-900">{activeEstablishment?.name ?? "Établissement"}</h2>
        <p className="mt-1 text-sm text-slate-600">Propriétaire et mode de location de l’établissement ouvert.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <label className="sdg-label">Nom du studio</label>
            <input className="sdg-input" value={model.studioName ?? ""} onChange={(e) => setModel({ ...model, studioName: e.target.value })} />
          </div>
          <div className="md:col-span-12">
            <label className="sdg-label" htmlFor="settings-hero-points">
              Points sous le titre
            </label>
            <textarea
              id="settings-hero-points"
              className="sdg-input min-h-28"
              value={model.heroPoints ?? ""}
              onChange={(e) => setModel({ ...model, heroPoints: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">Une ligne par point, affichés sur la page d’accueil du logement ouvert.</p>
          </div>
          <div className="md:col-span-6">
            <label className="sdg-label">Email public</label>
            <input className="sdg-input" value={model.publicEmail ?? ""} onChange={(e) => setModel({ ...model, publicEmail: e.target.value })} />
          </div>
          <div className="md:col-span-12">
            <label className="sdg-label" htmlFor="settings-rental-kind">
              Location
            </label>
            <select
              id="settings-rental-kind"
              className="sdg-input md:max-w-md"
              value={rentalKind}
              disabled={ownerBusy || !activeEstablishment}
              onChange={(e) => void changeRentalKind(e.target.value as RentalKind)}
            >
              <option value="FURNISHED_TOURISM">Meublé de tourisme</option>
              <option value="UNFURNISHED_MONTHLY">Logement loué vide au mois</option>
            </select>
          </div>
          <div className="md:col-span-12">
            <p className="sdg-label">Propriétaire</p>
            <ul className="mt-2 space-y-1">
              {(activeEstablishment?.owners ?? []).map((owner) => (
                <li key={owner.id} className="text-sm text-slate-800">
                  <span className="text-slate-500">Nom</span> {owner.lastName || "—"}
                  {" · "}
                  <span className="text-slate-500">Prénom</span> {owner.firstName || "—"}
                  {" · "}
                  <span className="text-slate-500">E-mail</span> {owner.email || "—"}
                  {" · "}
                  <span className="text-slate-500">Tél.</span> {owner.phone || "—"}
                </li>
              ))}
              {(activeEstablishment?.owners ?? []).length === 0 ? <li className="text-sm text-slate-600">Aucun propriétaire rattaché.</li> : null}
            </ul>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                className="sdg-input"
                value={ownerPick}
                onChange={(e) => setOwnerPick(e.target.value)}
                aria-label="Propriétaire existant"
                disabled={ownerBusy || !activeEstablishment}
              >
                <option value="">Choisir un propriétaire existant…</option>
                {ownerCatalog
                  .filter((owner) => !(activeEstablishment?.owners ?? []).some((current) => current.id === owner.id))
                  .map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {ownerLine(owner)}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="sdg-btn-primary shrink-0"
                disabled={ownerBusy || !ownerPick}
                onClick={() => void attachOwner(ownerPick)}
              >
                Rattacher
              </button>
              <button type="button" className="sdg-btn-soft shrink-0" disabled={ownerBusy || !activeEstablishment} onClick={() => setCreateOwnerOpen(true)}>
                Créer un propriétaire
              </button>
            </div>
            {ownerStatus ? <p className="mt-2 text-sm font-semibold text-rose-700">{ownerStatus}</p> : null}
          </div>
          <div className="md:col-span-6">
            <label className="sdg-label">Ville</label>
            <input className="sdg-input" value={model.city ?? ""} maxLength={80} onChange={(e) => setModel({ ...model, city: e.target.value })} />
          </div>
          <div className="md:col-span-12">
            <label className="sdg-label">Adresse</label>
            <input className="sdg-input" value={model.address ?? ""} onChange={(e) => setModel({ ...model, address: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Téléphone</label>
            <input className="sdg-input" value={model.phone ?? ""} onChange={(e) => setModel({ ...model, phone: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Type de logement</label>
            <input className="sdg-input" value={model.lodgingType ?? ""} onChange={(e) => setModel({ ...model, lodgingType: e.target.value })} placeholder="Studio / Appartement / Maison..." />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Surface (m²)</label>
            <input className="sdg-input" value={model.surfaceM2 ?? ""} onChange={(e) => setModel({ ...model, surfaceM2: e.target.value })} type="number" min={0} />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Minimum nuits</label>
            <input
              className="sdg-input"
              value={model.minNights ?? 1}
              onChange={(e) => setModel({ ...model, minNights: e.target.value })}
              type="number"
              min={1}
            />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Check-in</label>
            <input className="sdg-input" value={model.checkInTime ?? ""} onChange={(e) => setModel({ ...model, checkInTime: e.target.value })} placeholder="15:00" />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Check-out</label>
            <input className="sdg-input" value={model.checkOutTime ?? ""} onChange={(e) => setModel({ ...model, checkOutTime: e.target.value })} placeholder="11:00" />
          </div>

          <div className="md:col-span-12 rounded-2xl border border-water-200/80 bg-water-50/40 p-3 text-sm text-slate-700">
            Les <strong>demandes de réservation</strong> (site public ou compte client) créent un message détaillé dans la{" "}
            <strong>messagerie interne</strong> ; l’admin les voit sous <strong>Messages</strong>.
          </div>

          <div className="md:col-span-12 mt-2">
            <div className="text-sm font-extrabold tracking-tight text-slate-900">Équipements</div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                className="sdg-input"
                value={equipInput}
                onChange={(e) => setEquipInput(e.target.value)}
                placeholder="Ex: Clim, Chauffage, Terrasse, Parking..."
              />
              <button
                className="sdg-btn-primary"
                onClick={() => {
                  const v = equipInput.trim();
                  if (!v) return;
                  const next = Array.isArray(model.equipments) ? [...model.equipments] : [];
                  if (!next.includes(v)) next.push(v);
                  setModel({ ...model, equipments: next });
                  setEquipInput("");
                }}
              >
                Ajouter
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(model.equipments ?? []).map((e: string) => (
                <span key={e} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-extrabold text-slate-800">
                  {e}
                  <button
                    className="text-slate-500 hover:text-rose-700"
                    onClick={() => setModel({ ...model, equipments: (model.equipments ?? []).filter((x: string) => x !== e) })}
                    title="Supprimer"
                    type="button"
                  >
                    ×
                  </button>
                </span>
              ))}
              {(model.equipments ?? []).length === 0 ? <div className="text-sm text-slate-600">Aucun équipement.</div> : null}
            </div>
          </div>

          <div className="md:col-span-12 mt-2">
            <div className="text-sm font-extrabold tracking-tight text-slate-900">Liens / Réseaux sociaux</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <input className="sdg-input" value={socialLabel} onChange={(e) => setSocialLabel(e.target.value)} placeholder="Label (Instagram, Facebook...)" />
              </div>
              <div className="sm:col-span-6">
                <input className="sdg-input" value={socialUrl} onChange={(e) => setSocialUrl(e.target.value)} placeholder="URL" />
              </div>
              <div className="sm:col-span-2">
                <button
                  className="sdg-btn-primary w-full"
                  onClick={() => {
                    const label = socialLabel.trim();
                    const url = socialUrl.trim();
                    if (!label || !url) return;
                    const next = Array.isArray(model.socialLinks) ? [...model.socialLinks] : [];
                    next.push({ label, url });
                    setModel({ ...model, socialLinks: next });
                    setSocialLabel("");
                    setSocialUrl("");
                  }}
                  type="button"
                >
                  Ajouter
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {(model.socialLinks ?? []).map((l: any, idx: number) => (
                <div key={idx} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-semibold text-slate-900">{l?.label ?? "Lien"}</div>
                  <div className="text-sm text-slate-700">{l?.url ?? ""}</div>
                  <button
                    className="sdg-btn-danger"
                    onClick={() => setModel({ ...model, socialLinks: (model.socialLinks ?? []).filter((_: any, i: number) => i !== idx) })}
                    type="button"
                  >
                    Supprimer
                  </button>
                </div>
              ))}
              {(model.socialLinks ?? []).length === 0 ? <div className="text-sm text-slate-600">Aucun lien.</div> : null}
            </div>
          </div>

          <div className="md:col-span-12 mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 p-3">
              <input
                className="mt-1 h-4 w-4 accent-water-600"
                type="checkbox"
                checked={!!model.bookingAutoConfirm}
                onChange={(e) => setModel({ ...model, bookingAutoConfirm: e.target.checked })}
              />
              <span>
                <span className="block text-sm font-extrabold text-slate-900">Auto-confirmation</span>
                <span className="block text-sm text-slate-600">Confirme automatiquement les demandes (sinon: “PENDING”).</span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 p-3">
              <input
                className="mt-1 h-4 w-4 accent-water-600"
                type="checkbox"
                checked={!!model.maintenanceMode}
                onChange={(e) => setModel({ ...model, maintenanceMode: e.target.checked })}
              />
              <span>
                <span className="block text-sm font-extrabold text-slate-900">Mode maintenance</span>
                <span className="block text-sm text-slate-600">Prévu pour bloquer les actions publiques si besoin.</span>
              </span>
            </label>
          </div>
        </div>

        <div className="mt-4">
          <button className="sdg-btn-primary" onClick={() => void save()}>
            Enregistrer
          </button>
        </div>

        {status && <div className="mt-4 rounded-2xl border border-water-200 bg-water-50 p-3 text-sm text-water-900">{status}</div>}
      </div>

      <div className="sdg-card mt-6 p-4 md:p-5">
        <div className="text-sm font-extrabold tracking-tight text-slate-900">Frais annexes</div>
        <p className="mt-1 text-sm text-slate-600">
          Chaque ligne s’ajoute au montant du séjour lors d’une demande de réservation (visiteur ou client connecté). Tu peux en
          créer ou modifier autant que nécessaire ; seules les lignes <span className="font-semibold">actives</span> sont facturées.
        </p>

        <div className="mt-4 space-y-3">
          {ancillaryFees.map((f) => (
            <AncillaryFeeRowEditor key={f.id} row={f} onDone={() => void reloadAncillaryFees()} />
          ))}
          {ancillaryFees.length === 0 ? <div className="text-sm text-slate-600">Aucun frais pour le moment.</div> : null}
        </div>

        <div className="mt-6 border-t border-slate-200/80 pt-4">
          <div className="text-sm font-extrabold text-slate-900">Nouveau frais</div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-12 md:items-end">
            <div className="md:col-span-6">
              <label className="sdg-label">Libellé</label>
              <input
                className="sdg-input"
                value={newAncLabel}
                onChange={(e) => setNewAncLabel(e.target.value)}
                placeholder="Ex. Ménage fin de séjour"
              />
            </div>
            <div className="md:col-span-3">
              <label className="sdg-label">Montant (€)</label>
              <input className="sdg-input" value={newAncEuro} onChange={(e) => setNewAncEuro(e.target.value)} inputMode="decimal" placeholder="50" />
            </div>
            <div className="md:col-span-2">
              <label className="sdg-label">Ordre</label>
              <input className="sdg-input" value={newAncSort} onChange={(e) => setNewAncSort(e.target.value)} inputMode="numeric" />
            </div>
            <div className="md:col-span-1">
              <button
                type="button"
                className="sdg-btn-primary w-full"
                onClick={async () => {
                  setAncillaryStatus(null);
                  const cents = euroInputToCents(newAncEuro);
                  if (cents == null) {
                    setAncillaryStatus("Montant invalide.");
                    return;
                  }
                  if (!newAncLabel.trim()) {
                    setAncillaryStatus("Libellé requis.");
                    return;
                  }
                  try {
                    await api.adminCreateAncillaryFee({
                      label: newAncLabel.trim(),
                      priceCents: cents,
                      sortOrder: Number.parseInt(newAncSort, 10) || 0,
                      active: true
                    });
                    setNewAncLabel("");
                    setNewAncEuro("");
                    setNewAncSort("0");
                    await reloadAncillaryFees();
                    setAncillaryStatus("Frais ajouté.");
                  } catch (e: any) {
                    setAncillaryStatus(e?.error ?? "Erreur");
                  }
                }}
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
        {ancillaryStatus ? <div className="mt-3 text-sm font-semibold text-water-900">{ancillaryStatus}</div> : null}
      </div>
      {createOwnerOpen ? (
        <OwnerCreateModal busy={ownerBusy} onClose={() => setCreateOwnerOpen(false)} onCreate={createAndAttachOwner} />
      ) : null}
    </div>
  );
}

