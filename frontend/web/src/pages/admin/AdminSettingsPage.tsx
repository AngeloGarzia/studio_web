import React from "react";
import { api } from "../../lib/api";

type AncillaryFeeRow = { id: string; label: string; priceCents: number; sortOrder: number; active: boolean };

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
    ownerName: "",
    address: "",
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
    try {
      await api.adminSaveSettings({
        studioName: model.studioName,
        ownerName: model.ownerName?.trim() ? model.ownerName.trim() : null,
        address: model.address || null,
        phone: model.phone || null,
        publicEmail: model.publicEmail || null,
        lodgingType: model.lodgingType || null,
        surfaceM2: model.surfaceM2 ? Number(model.surfaceM2) : null,
        equipments: Array.isArray(model.equipments) ? model.equipments : [],
        socialLinks: Array.isArray(model.socialLinks) ? model.socialLinks : [],
        minNights: Number(model.minNights),
        checkInTime: model.checkInTime || null,
        checkOutTime: model.checkOutTime || null,
        bookingAutoConfirm: Boolean(model.bookingAutoConfirm),
        maintenanceMode: Boolean(model.maintenanceMode)
      });
      const s = await api.adminGetSettings().catch(() => null);
      if (s) {
        setModel((prev: any) => ({
          ...prev,
          ...s
        }));
      }
      setStatus("Enregistré.");
    } catch (e: any) {
      setStatus(`Erreur: ${e?.error ?? "UNKNOWN"}`);
    }
  };

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Admin — Paramètres</h1>
      <p className="sdg-subtitle mt-2">Informations publiques + règles de réservation.</p>

      <div className="sdg-card mt-6 p-4 md:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <label className="sdg-label">Nom du studio</label>
            <input className="sdg-input" value={model.studioName ?? ""} onChange={(e) => setModel({ ...model, studioName: e.target.value })} />
          </div>
          <div className="md:col-span-6">
            <label className="sdg-label">Email public</label>
            <input className="sdg-input" value={model.publicEmail ?? ""} onChange={(e) => setModel({ ...model, publicEmail: e.target.value })} />
          </div>
          <div className="md:col-span-12">
            <label className="sdg-label">Nom du propriétaire (infos pratiques publiques)</label>
            <input
              className="sdg-input"
              value={model.ownerName ?? ""}
              onChange={(e) => setModel({ ...model, ownerName: e.target.value })}
              placeholder="Prénom et nom affichés sur la page Infos pratiques"
            />
          </div>
          <div className="md:col-span-6">
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
    </div>
  );
}

