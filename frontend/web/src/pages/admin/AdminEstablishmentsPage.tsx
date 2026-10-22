import React from "react";
import { api, mediaUrl } from "../../lib/api";
import { DateField } from "../../lib/dateField";

type RentalKind = "FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY";

type Tenant = { id: string; name: string; email: string | null; phone: string | null };

type Owner = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
  isCompany?: boolean;
  companyName?: string | null;
};

function ownerLabel(owner: { firstName: string; lastName: string }) {
  return `${owner.firstName} ${owner.lastName}`.trim();
}

function quittanceBailleurName(owner: Owner) {
  const company = owner.companyName?.trim();
  if (owner.isCompany && company) return company;
  return ownerLabel(owner);
}

type EstablishmentRow = {
  id: string;
  name: string;
  rentalKind: RentalKind;
  tenants: Tenant[];
  owners: Owner[];
  monthlyRentCents: number;
  monthlyChargesCents: number;
  address: string | null;
  city: string;
  studioName: string;
  description: string;
  coverMediaId: string | null;
  active: boolean;
};

function euros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function splitCents(total: number, count: number) {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const rest = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index === count - 1 ? rest : 0));
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseEuroToCents(raw: string): number | null {
  const n = Number(String(raw).trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100);
}

function todayYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function currentMonthBounds() {
  const today = todayYmd();
  const yearMonth = today.slice(0, 7);
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const last = new Date(year, month, 0).getDate();
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(last).padStart(2, "0")}` };
}

function sentNotice(to: string, owners: string[] | undefined) {
  if (!owners?.length) return `Document envoyé à ${to}.`;
  const who = owners.length > 1 ? "aux propriétaires" : "au propriétaire";
  return `Document envoyé à ${to} et ${who} ${owners.join(", ")}.`;
}

function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function messageOf(e: unknown) {
  const code = e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "Erreur";
  const issues =
    e && typeof e === "object" && "issues" in e && Array.isArray((e as { issues: unknown }).issues)
      ? (e as { issues: Array<{ path?: unknown; message?: string }> }).issues
      : [];
  if (code === "VALIDATION_ERROR") {
    const emailIssue = issues.some((issue) => Array.isArray(issue.path) && issue.path.includes("email"));
    if (emailIssue) return "L’e-mail n’est pas valide. Laisse le champ vide, ou indique une adresse complète.";
    if (issues.some((issue) => Array.isArray(issue.path) && issue.path.includes("periodTo"))) {
      return "La fin de période doit être après le début.";
    }
    return "Certaines informations saisies ne sont pas valides.";
  }
  if (code === "COVER_NOT_FOUND") return "Choisis une photo publiée de cet établissement.";
  if (code === "LAST_OWNER") return "Un établissement doit garder au moins un propriétaire.";
  if (code === "ALREADY_OWNER") return "Ce propriétaire est déjà rattaché à cet établissement.";
  if (code === "NO_GUEST_EMAIL") return "Indique l’e-mail du locataire avant d’envoyer la quittance.";
  if (code === "OWNERS_REQUIRED" || code === "QUITTANCE_PARTIES_REQUIRED") {
    return "Une quittance doit concerner au moins un propriétaire et un locataire.";
  }
  if (code === "QUITTANCE_LINKED") return "Cette personne figure sur une quittance déjà envoyée.";
  if (code === "MAIL_DISABLED") return "L’envoi d’e-mails n’est pas configuré.";
  if (code === "MAIL_SEND_FAILED") return "L’e-mail n’a pas pu être envoyé.";
  if (code === "HAS_TENANTS") return "Retire les locataires avant de passer cet établissement en meublé de tourisme.";
  if (code === "LAST_ESTABLISHMENT") return "Il doit rester au moins un établissement.";
  return code;
}

function QuittanceModal({
  establishment,
  tenantId,
  tenantName,
  tenantEmail,
  onClose,
  onSent
}: {
  establishment: EstablishmentRow;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  onClose: () => void;
  onSent: (result: { to: string; owners?: string[] }) => void;
}) {
  const period = currentMonthBounds();
  const owners = establishment.owners ?? [];
  const bailleurFromOwners = owners.map((owner) => quittanceBailleurName(owner)).filter(Boolean).join(", ");
  const bailleurAddressFromOwners = [...new Set(owners.map((owner) => owner.address?.trim()).filter(Boolean))].join(", ");
  const [bailleurName, setBailleurName] = React.useState(bailleurFromOwners || establishment.studioName || establishment.name);
  const [bailleurAddress, setBailleurAddress] = React.useState(bailleurAddressFromOwners || establishment.address || "");
  const [bailleurPhone, setBailleurPhone] = React.useState(owners.find((owner) => owner.phone)?.phone ?? "");
  const [bailleurEmail, setBailleurEmail] = React.useState(owners.find((owner) => owner.email)?.email ?? "");
  const [name, setName] = React.useState(tenantName);
  const [email, setEmail] = React.useState(tenantEmail);
  const [logement, setLogement] = React.useState(
    [establishment.studioName || establishment.name, establishment.address].filter(Boolean).join(", ")
  );
  const [periodFrom, setPeriodFrom] = React.useState(period.from);
  const [periodTo, setPeriodTo] = React.useState(period.to);
  const [rentInput, setRentInput] = React.useState(centsToInput(establishment.monthlyRentCents));
  const [chargesInput, setChargesInput] = React.useState(centsToInput(establishment.monthlyChargesCents));
  const [receivedInput, setReceivedInput] = React.useState(centsToInput(establishment.monthlyRentCents + establishment.monthlyChargesCents));
  const [paymentDate, setPaymentDate] = React.useState(todayYmd);
  const [paymentMethod, setPaymentMethod] = React.useState("Virement");
  const [place, setPlace] = React.useState("Balaruc-les-Bains");
  const [issueDate, setIssueDate] = React.useState(todayYmd);
  const [busy, setBusy] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [splitByTenant, setSplitByTenant] = React.useState(false);
  const [shares, setShares] = React.useState(() => {
    const roster = (establishment.tenants ?? []).some((tenant) => tenant.id === tenantId)
      ? establishment.tenants
      : [{ id: tenantId, name: tenantName, email: tenantEmail, phone: null as string | null }, ...(establishment.tenants ?? [])];
    const rents = splitCents(establishment.monthlyRentCents, roster.length);
    const charges = splitCents(establishment.monthlyChargesCents, roster.length);
    return roster.map((tenant, index) => ({
      tenantId: tenant.id,
      name: tenant.id === tenantId ? tenantName : tenant.name,
      email: tenant.id === tenantId ? tenantEmail : tenant.email ?? "",
      phone: tenant.phone ?? "",
      rentInput: centsToInput(rents[index] ?? 0),
      chargesInput: centsToInput(charges[index] ?? 0),
      receivedInput: centsToInput((rents[index] ?? 0) + (charges[index] ?? 0))
    }));
  });
  const several = shares.length > 1;

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const rentCents = parseEuroToCents(rentInput);
  const chargesCents = parseEuroToCents(chargesInput);
  const receivedCents = parseEuroToCents(receivedInput);
  const dueCents = rentCents != null && chargesCents != null ? rentCents + chargesCents : 0;
  const shareRows = shares.map((share) => ({
    share,
    rent: parseEuroToCents(share.rentInput),
    charges: parseEuroToCents(share.chargesInput),
    received: parseEuroToCents(share.receivedInput)
  }));
  const partial = several && splitByTenant
    ? shareRows.some((row) => row.rent != null && row.charges != null && row.received != null && row.received < row.rent + row.charges && row.rent + row.charges > 0)
    : receivedCents != null && dueCents > 0 && receivedCents < dueCents;

  const documentBase = () => ({
    establishmentId: establishment.id,
    bailleurName: bailleurName.trim(),
    bailleurAddress: bailleurAddress.trim(),
    bailleurPhone: bailleurPhone.trim(),
    bailleurEmail: bailleurEmail.trim(),
    logement: logement.trim(),
    periodFrom,
    periodTo,
    paymentDate,
    paymentMethod,
    place: place.trim(),
    issueDate,
    feeLines: [] as Array<{ label: string; priceCents: number }>
  });

  const updateShare = (id: string, patch: Partial<(typeof shares)[number]>) => {
    setShares((current) => current.map((share) => (share.tenantId === id ? { ...share, ...patch } : share)));
  };

  const toggleSplit = (checked: boolean) => {
    if (checked) {
      const rents = splitCents(rentCents ?? 0, shares.length);
      const charges = splitCents(chargesCents ?? 0, shares.length);
      setShares((current) =>
        current.map((share, index) => ({
          ...share,
          rentInput: centsToInput(rents[index] ?? 0),
          chargesInput: centsToInput(charges[index] ?? 0),
          receivedInput: centsToInput((rents[index] ?? 0) + (charges[index] ?? 0))
        }))
      );
    } else {
      const parsed = shares.map((share) => ({
        rent: parseEuroToCents(share.rentInput) ?? 0,
        charges: parseEuroToCents(share.chargesInput) ?? 0,
        received: parseEuroToCents(share.receivedInput) ?? 0
      }));
      setRentInput(centsToInput(parsed.reduce((sum, row) => sum + row.rent, 0)));
      setChargesInput(centsToInput(parsed.reduce((sum, row) => sum + row.charges, 0)));
      setReceivedInput(centsToInput(parsed.reduce((sum, row) => sum + row.received, 0)));
    }
    setSplitByTenant(checked);
  };

  const readyBase = () => {
    if (!bailleurName.trim() || !logement.trim() || !place.trim()) {
      setError("Le bailleur, le logement et le lieu sont obligatoires.");
      return null;
    }
    if (!periodFrom || !periodTo || periodTo <= periodFrom) {
      setError("La fin de période doit être après le début.");
      return null;
    }
    return documentBase();
  };

  const payload = () => {
    const base = readyBase();
    if (!base) return null;
    if (several && splitByTenant) {
      if (shareRows.some((row) => !row.share.name.trim() || !looksLikeEmail(row.share.email))) {
        setError("Chaque locataire doit avoir un nom et un e-mail valide.");
        return null;
      }
      if (shareRows.some((row) => row.rent == null || row.charges == null || row.received == null || row.rent + row.charges <= 0)) {
        setError("Indique le loyer ou les charges de chaque locataire.");
        return null;
      }
      const first = shareRows[0];
      setError(null);
      return {
        ...base,
        splitByTenant: true,
        tenantId: first.share.tenantId,
        tenantEmail: first.share.email.trim(),
        tenantName: first.share.name.trim(),
        rentCents: first.rent ?? 0,
        chargesCents: first.charges ?? 0,
        receivedCents: first.received ?? 0,
        occupants: shareRows.map((row) => ({
          tenantId: row.share.tenantId,
          tenantName: row.share.name.trim(),
          tenantEmail: row.share.email.trim(),
          phone: row.share.phone.trim(),
          rentCents: row.rent ?? 0,
          chargesCents: row.charges ?? 0,
          receivedCents: row.received ?? 0
        }))
      };
    }
    if (several) {
      if (shares.some((share) => !share.name.trim())) {
        setError("Chaque locataire doit avoir un nom.");
        return null;
      }
      if (shares.some((share) => share.email.trim() && !looksLikeEmail(share.email))) {
        setError("Un e-mail de locataire n’est pas valide.");
        return null;
      }
      const reachable = shares.filter((share) => looksLikeEmail(share.email));
      if (reachable.length < 1) {
        setError("Au moins un locataire doit avoir un e-mail.");
        return null;
      }
      if (rentCents == null || chargesCents == null || receivedCents == null || dueCents <= 0) {
        setError("Indique un loyer ou des charges supérieurs à zéro.");
        return null;
      }
      setError(null);
      return {
        ...base,
        splitByTenant: false,
        tenantId,
        tenantEmail: reachable[0].email.trim(),
        tenantName: shares.map((share) => share.name.trim()).filter(Boolean).join(", "),
        rentCents,
        chargesCents,
        receivedCents,
        occupants: shares.map((share) => ({
          tenantId: share.tenantId,
          tenantName: share.name.trim(),
          tenantEmail: looksLikeEmail(share.email) ? share.email.trim() : "",
          phone: share.phone.trim()
        }))
      };
    }
    if (!email.trim() || !name.trim() || !looksLikeEmail(email)) {
      setError("Le locataire et son e-mail sont obligatoires.");
      return null;
    }
    if (rentCents == null || chargesCents == null || receivedCents == null || dueCents <= 0) {
      setError("Indique un loyer ou des charges supérieurs à zéro.");
      return null;
    }
    setError(null);
    return {
      ...base,
      tenantId,
      tenantEmail: email.trim(),
      tenantName: name.trim(),
      rentCents,
      chargesCents,
      receivedCents
    };
  };

  const showPreview = async (body: Parameters<typeof api.adminPreviewMonthlyQuittance>[0]) => {
    setPreviewing(true);
    setError(null);
    try {
      const blob = await api.adminPreviewMonthlyQuittance(body);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setPreviewing(false);
    }
  };

  const preview = async () => {
    const body = payload();
    if (!body || body.splitByTenant) return;
    await showPreview(body);
  };

  const previewShare = async (share: (typeof shares)[number]) => {
    const base = readyBase();
    const rent = parseEuroToCents(share.rentInput);
    const charges = parseEuroToCents(share.chargesInput);
    const received = parseEuroToCents(share.receivedInput);
    if (!base) return;
    if (!share.name.trim() || !looksLikeEmail(share.email)) {
      setError("Ce locataire doit avoir un nom et un e-mail valide.");
      return;
    }
    if (rent == null || charges == null || received == null || rent + charges <= 0) {
      setError("Indique le loyer ou les charges de ce locataire.");
      return;
    }
    await showPreview({
      ...base,
      tenantId: share.tenantId,
      tenantEmail: share.email.trim(),
      tenantName: share.name.trim(),
      rentCents: rent,
      chargesCents: charges,
      receivedCents: received,
      occupants: [{ tenantId: share.tenantId, tenantName: share.name.trim(), tenantEmail: share.email.trim(), phone: share.phone.trim() }]
    });
  };

  const send = async () => {
    const body = payload();
    if (!body) return;
    setBusy(true);
    try {
      onSent(await api.adminSendMonthlyQuittance(body));
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tenant-quittance-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="tenant-quittance-title" className="text-lg font-bold text-slate-900">
              {partial ? "Reçu de loyer" : "Quittance de loyer"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">Document prérempli. Tu peux tout modifier, y compris la période, avant l’envoi.</p>
          </div>
          <button type="button" className="sdg-btn-soft" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Bailleur
            <input className="sdg-input mt-1" value={bailleurName} onChange={(e) => setBailleurName(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Adresse du bailleur
            <input className="sdg-input mt-1" value={bailleurAddress} onChange={(e) => setBailleurAddress(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Téléphone du bailleur
            <input className="sdg-input mt-1" value={bailleurPhone} onChange={(e) => setBailleurPhone(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            E-mail du bailleur
            <input className="sdg-input mt-1" type="email" value={bailleurEmail} onChange={(e) => setBailleurEmail(e.target.value)} />
          </label>
          {several ? (
            <div className="md:col-span-2 rounded-2xl border border-water-100 bg-water-50/40 p-3">
              <label className="flex items-start gap-2 text-sm font-semibold text-slate-800">
                <input type="checkbox" className="mt-1" checked={splitByTenant} onChange={(event) => toggleSplit(event.target.checked)} />
                <span>
                  Une quittance par locataire
                  <span className="mt-1 block font-normal text-slate-600">
                    Sans cette case, une seule quittance reprend tous les locataires. Avec la case, chaque locataire reçoit la sienne, avec son loyer et ses charges.
                  </span>
                </span>
              </label>
              <ul className="mt-3 space-y-3">
                {shares.map((share) => (
                  <li key={share.tenantId} className="rounded-xl border border-white bg-white p-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="text-sm font-semibold text-slate-700">
                        Locataire
                        <input className="sdg-input mt-1" value={share.name} onChange={(event) => updateShare(share.tenantId, { name: event.target.value })} />
                      </label>
                      <label className="text-sm font-semibold text-slate-700">
                        E-mail
                        <input className="sdg-input mt-1" type="email" value={share.email} onChange={(event) => updateShare(share.tenantId, { email: event.target.value })} />
                      </label>
                      {splitByTenant ? (
                        <>
                          <label className="text-sm font-semibold text-slate-700">
                            Loyer hors charges (€)
                            <input className="sdg-input mt-1" inputMode="decimal" value={share.rentInput} onChange={(event) => updateShare(share.tenantId, { rentInput: event.target.value })} />
                          </label>
                          <label className="text-sm font-semibold text-slate-700">
                            Provisions pour charges (€)
                            <input className="sdg-input mt-1" inputMode="decimal" value={share.chargesInput} onChange={(event) => updateShare(share.tenantId, { chargesInput: event.target.value })} />
                          </label>
                          <label className="text-sm font-semibold text-slate-700">
                            Somme reçue (€)
                            <input className="sdg-input mt-1" inputMode="decimal" value={share.receivedInput} onChange={(event) => updateShare(share.tenantId, { receivedInput: event.target.value })} />
                          </label>
                          <div className="flex items-end">
                            <button type="button" className="sdg-btn-soft" disabled={busy || previewing} onClick={() => void previewShare(share)}>
                              Aperçu
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <label className="text-sm font-semibold text-slate-700">
                Locataire
                <input className="sdg-input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                E-mail du locataire
                <input className="sdg-input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </>
          )}
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Logement loué
            <input className="sdg-input mt-1" value={logement} onChange={(e) => setLogement(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Début de la période
            <DateField className="sdg-input mt-1" value={periodFrom} onChange={setPeriodFrom} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Fin de la période
            <DateField className="sdg-input mt-1" value={periodTo} onChange={setPeriodTo} />
          </label>
          {several && splitByTenant ? null : (
            <>
              <label className="text-sm font-semibold text-slate-700">
                Loyer hors charges (€)
                <input className="sdg-input mt-1" inputMode="decimal" value={rentInput} onChange={(e) => setRentInput(e.target.value)} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Provisions pour charges (€)
                <input className="sdg-input mt-1" inputMode="decimal" value={chargesInput} onChange={(e) => setChargesInput(e.target.value)} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Somme reçue (€)
                <input className="sdg-input mt-1" inputMode="decimal" value={receivedInput} onChange={(e) => setReceivedInput(e.target.value)} />
              </label>
            </>
          )}
          <label className="text-sm font-semibold text-slate-700">
            Mode de paiement
            <select className="sdg-input mt-1" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option>Virement</option>
              <option>Carte bancaire</option>
              <option>Chèque</option>
              <option>Espèces</option>
              <option>Autre</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Date du paiement
            <DateField className="sdg-input mt-1" value={paymentDate} onChange={setPaymentDate} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Fait à
            <input className="sdg-input mt-1" value={place} onChange={(e) => setPlace(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Date de la quittance
            <DateField className="sdg-input mt-1" value={issueDate} onChange={setIssueDate} />
          </label>
        </div>
        {partial ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
            La somme reçue est inférieure au total. Le document envoyé sera un reçu, avec le solde restant dû.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {several && splitByTenant ? null : (
            <button type="button" className="sdg-btn-soft" disabled={busy || previewing} onClick={() => void preview()}>
              {previewing ? "Aperçu…" : "Aperçu PDF"}
            </button>
          )}
          <button type="button" className="sdg-btn-primary" disabled={busy || previewing} onClick={() => void send()}>
            {busy ? "Envoi…" : several && splitByTenant ? "Envoyer les quittances" : partial ? "Envoyer le reçu" : "Envoyer la quittance"}
          </button>
          <button type="button" className="sdg-btn-soft" disabled={busy} onClick={onClose}>
            Annuler
          </button>
        </div>
        {previewUrl ? (
          <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center" role="presentation" onClick={() => setPreviewUrl(null)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="quittance-preview-title"
              className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-2xl bg-white p-4 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 id="quittance-preview-title" className="text-lg font-bold text-slate-900">
                  Aperçu de la quittance
                </h3>
                <button type="button" className="sdg-btn-soft" onClick={() => setPreviewUrl(null)}>
                  Fermer
                </button>
              </div>
              <iframe title="Aperçu PDF de la quittance" src={previewUrl} className="h-[75vh] w-full rounded-xl border border-slate-200" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TenantFileModal({
  establishment,
  tenantId,
  onClose,
  onSaved
}: {
  establishment: EstablishmentRow;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    nationality: "",
    formerAddress: "",
    phone: "",
    email: "",
    visaNumber: "",
    leaseStart: ""
  });
  const [months, setMonths] = React.useState<
    Array<{ month: string; status: "paid" | "partial" | "unpaid"; dueCents: number; receivedCents: number; balanceCents: number; receiptId: string | null }>
  >([]);
  const [quittanceOpen, setQuittanceOpen] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void api
      .adminTenantFile(establishment.id, tenantId)
      .then((file) => {
        if (!alive) return;
        setForm({
          firstName: file.tenant.firstName,
          lastName: file.tenant.lastName,
          birthDate: file.tenant.birthDate,
          nationality: file.tenant.nationality ?? "",
          formerAddress: file.tenant.formerAddress ?? "",
          phone: file.tenant.phone ?? "",
          email: file.tenant.email ?? "",
          visaNumber: file.tenant.visaNumber ?? "",
          leaseStart: file.tenant.leaseStart
        });
        setMonths(file.months);
      })
      .catch((e: unknown) => {
        if (alive) setError(messageOf(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [establishment.id, tenantId]);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const save = async () => {
    if (!form.lastName.trim() || !form.leaseStart) {
      setError("Le nom et la date d’entrée sont obligatoires.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.adminUpdateMonthlyTenant(establishment.id, tenantId, form);
      const file = await api.adminTenantFile(establishment.id, tenantId);
      setMonths(file.months);
      onSaved();
      setNotice("Fiche enregistrée.");
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async (receiptId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.adminResendReceipt(establishment.id, tenantId, receiptId);
      setNotice(sentNotice(result.to, result.owners).replace("Document envoyé", "Quittance renvoyée"));
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = { paid: "Loyer réglé", partial: "Paiement partiel", unpaid: "Loyer impayé" };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tenant-file-title"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="tenant-file-title" className="text-lg font-bold text-slate-900">
            Fiche locataire
          </h2>
          <button type="button" className="sdg-btn-soft" onClick={onClose}>
            Fermer
          </button>
        </div>
        {loading ? <p className="mt-4 text-sm text-slate-600">Chargement…</p> : null}
        {!loading ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Prénom
                <input className="sdg-input mt-1" value={form.firstName} onChange={set("firstName")} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Nom
                <input className="sdg-input mt-1" value={form.lastName} onChange={set("lastName")} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Date de naissance
                <DateField className="sdg-input mt-1" value={form.birthDate} onChange={(ymd) => setForm((current) => ({ ...current, birthDate: ymd }))} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Nationalité
                <input className="sdg-input mt-1" value={form.nationality} onChange={set("nationality")} />
              </label>
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                Ancienne adresse
                <input className="sdg-input mt-1" value={form.formerAddress} onChange={set("formerAddress")} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Téléphone
                <input className="sdg-input mt-1" value={form.phone} onChange={set("phone")} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                E-mail
                <input className="sdg-input mt-1" type="email" value={form.email} onChange={set("email")} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Numéro de visa
                <input className="sdg-input mt-1" value={form.visaNumber} onChange={set("visaNumber")} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Date d’entrée dans le logement
                <DateField className="sdg-input mt-1" value={form.leaseStart} onChange={(ymd) => setForm((current) => ({ ...current, leaseStart: ymd }))} />
              </label>
            </div>
            <button type="button" className="sdg-btn-primary mt-4" disabled={busy} onClick={() => void save()}>
              Enregistrer
            </button>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">État financier</h3>
              <button type="button" className="sdg-btn-primary" disabled={busy} onClick={() => setQuittanceOpen(true)}>
                Envoyer une quittance
              </button>
            </div>
            <ul className="mt-2 divide-y divide-slate-200">
              {months.map((month) => (
                <li key={month.month} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-semibold capitalize">{monthLabel(month.month)}</span>
                    {" · "}
                    {statusLabel[month.status]}
                    {" · dû "}
                    {euros(month.dueCents)}
                    {" · reçu "}
                    {euros(month.receivedCents)}
                    {month.balanceCents > 0 ? ` · reste ${euros(month.balanceCents)}` : ""}
                  </span>
                  {month.receiptId ? (
                    <button type="button" className="sdg-btn-soft" disabled={busy} onClick={() => void resend(month.receiptId!)}>
                      Renvoyer
                    </button>
                  ) : null}
                </li>
              ))}
              {months.length === 0 ? <li className="py-2 text-sm text-slate-600">Aucun mois échu depuis l’entrée dans le logement.</li> : null}
            </ul>
          </>
        ) : null}
        {notice ? <p className="mt-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}
        {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        {quittanceOpen ? (
          <QuittanceModal
            establishment={establishment}
            tenantId={tenantId}
            tenantName={`${form.firstName} ${form.lastName}`.trim()}
            tenantEmail={form.email}
            onClose={() => setQuittanceOpen(false)}
            onSent={(result) => {
              setQuittanceOpen(false);
              setNotice(sentNotice(result.to, result.owners));
              void api.adminTenantFile(establishment.id, tenantId).then((file) => setMonths(file.months));
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function MonthlyTenants({
  establishment,
  tenants,
  onChanged
}: {
  establishment: EstablishmentRow;
  tenants: Tenant[];
  onChanged: () => void;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const add = async () => {
    if (!name.trim()) {
      setError("Indique le nom du locataire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminCreateMonthlyTenant(establishment.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim()
      });
      setName("");
      setEmail("");
      setPhone("");
      onChanged();
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tenantId: string) => {
    if (!window.confirm("Retirer ce locataire de l’établissement ?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminDeleteMonthlyTenant(establishment.id, tenantId);
      onChanged();
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <p className="text-sm font-bold text-slate-800">Locataires</p>
      <ul className="mt-2 space-y-1">
        {tenants.map((tenant) => (
          <li key={tenant.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {tenant.name}
              {tenant.email ? ` · ${tenant.email}` : ""}
              {tenant.phone ? ` · ${tenant.phone}` : ""}
            </span>
            <span className="flex gap-2">
              <button type="button" className="sdg-btn-soft" onClick={() => setOpenId(tenant.id)}>
                Fiche
              </button>
              <button type="button" className="sdg-btn-soft" disabled={busy} onClick={() => void remove(tenant.id)}>
                Retirer
              </button>
            </span>
          </li>
        ))}
        {tenants.length === 0 ? <li className="text-sm text-slate-600">Aucun locataire rattaché.</li> : null}
      </ul>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <input className="sdg-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du locataire" />
        <input className="sdg-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" type="email" />
        <input className="sdg-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone" />
        <button type="button" className="sdg-btn-primary" disabled={busy} onClick={() => void add()}>
          Ajouter
        </button>
      </div>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
      {openId ? (
        <TenantFileModal establishment={establishment} tenantId={openId} onClose={() => setOpenId(null)} onSaved={onChanged} />
      ) : null}
    </div>
  );
}

function EditEstablishmentModal({
  establishment,
  onClose,
  onSaved
}: {
  establishment: EstablishmentRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(establishment.name);
  const [kind, setKind] = React.useState<RentalKind>(establishment.rentalKind);
  const [address, setAddress] = React.useState(establishment.address ?? "");
  const [city, setCity] = React.useState(establishment.city ?? "");
  const [description, setDescription] = React.useState(establishment.description ?? "");
  const [coverMediaId, setCoverMediaId] = React.useState<string | null>(establishment.coverMediaId);
  const [images, setImages] = React.useState<Array<{ id: string; title: string | null; thumbUrl: string }>>([]);
  const [rentInput, setRentInput] = React.useState(centsToInput(establishment.monthlyRentCents));
  const [chargesInput, setChargesInput] = React.useState(centsToInput(establishment.monthlyChargesCents));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

function kindLabel(kind: RentalKind) {
  return kind === "UNFURNISHED_MONTHLY" ? "Logement loué vide au mois" : "Meublé de tourisme";
}

function EstablishmentOwners({
  establishmentId,
  owners,
  catalog,
  onChanged
}: {
  establishmentId: string;
  owners: Owner[];
  catalog: Owner[];
  onChanged: () => void;
}) {
  const [ownerId, setOwnerId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ firstName: "", lastName: "", email: "", phone: "" });
  const available = catalog.filter((owner) => !owners.some((current) => current.id === owner.id));

  const attach = async () => {
    if (!ownerId) {
      setError("Choisis un propriétaire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminAttachOwner(establishmentId, ownerId);
      setOwnerId("");
      onChanged();
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (owner: Owner) => {
    setEditingId(owner.id);
    setForm({
      firstName: owner.firstName,
      lastName: owner.lastName,
      email: owner.email ?? "",
      phone: owner.phone ?? ""
    });
    setError(null);
  };

  const save = async () => {
    if (!editingId || !form.lastName.trim()) {
      setError("Indique le nom du propriétaire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminUpdateOwner(editingId, form);
      setEditingId(null);
      onChanged();
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const detach = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.adminDetachOwner(establishmentId, id);
      onChanged();
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-slate-200 pt-3">
      <p className="text-sm font-bold text-slate-800">Propriétaires</p>
      <ul className="mt-2 space-y-1">
        {owners.map((owner) => (
          <li key={owner.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            {editingId === owner.id ? (
              <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-4">
                <input className="sdg-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Nom" aria-label="Nom" />
                <input className="sdg-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Prénom" aria-label="Prénom" />
                <input className="sdg-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-mail" aria-label="E-mail" type="email" />
                <input className="sdg-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Téléphone" aria-label="Téléphone" />
              </div>
            ) : (
              <span>
                <span className="text-slate-500">Nom</span> {owner.lastName || "—"}
                {" · "}
                <span className="text-slate-500">Prénom</span> {owner.firstName || "—"}
                {" · "}
                <span className="text-slate-500">E-mail</span> {owner.email || "—"}
                {" · "}
                <span className="text-slate-500">Tél.</span> {owner.phone || "—"}
              </span>
            )}
            <span className="flex gap-2">
              {editingId === owner.id ? (
                <button type="button" className="sdg-btn-primary" disabled={busy} onClick={() => void save()}>
                  Enregistrer
                </button>
              ) : (
                <button type="button" className="sdg-btn-soft" disabled={busy} onClick={() => startEdit(owner)}>
                  Modifier
                </button>
              )}
              <button type="button" className="sdg-btn-soft" disabled={busy} onClick={() => void detach(owner.id)}>
                Retirer
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select className="sdg-input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Propriétaire à rattacher">
          <option value="">Ajouter un propriétaire…</option>
          {available.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {ownerLabel(owner)}
            </option>
          ))}
        </select>
        <button type="button" className="sdg-btn-primary shrink-0" disabled={busy || available.length === 0} onClick={() => void attach()}>
          Rattacher
        </button>
      </div>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}

function OwnerDirectory({
  owners,
  onChanged
}: {
  owners: Array<Owner & { establishments: Array<{ id: string; name: string }> }>;
  onChanged: () => void;
}) {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const add = async () => {
    if (!lastName.trim()) {
      setError("Indique le nom du propriétaire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminCreateOwner({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() });
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      onChanged();
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ownerId: string) => {
    if (!window.confirm("Supprimer ce propriétaire ?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminDeleteOwner(ownerId);
      onChanged();
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sdg-card mt-4 p-4 md:p-6">
      <h2 className="text-lg font-extrabold text-slate-900">Propriétaires</h2>
      <p className="mt-1 text-sm text-slate-600">Un propriétaire peut n’avoir aucun établissement, ou plusieurs. Chaque établissement en garde au moins un.</p>
      <ul className="mt-3 space-y-1">
        {owners.map((owner) => (
          <li key={owner.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {ownerLabel(owner)}
              {owner.establishments.length === 0
                ? " · aucun établissement"
                : ` · ${owner.establishments.map((establishment) => establishment.name).join(", ")}`}
            </span>
            <button type="button" className="sdg-btn-soft" disabled={busy} onClick={() => void remove(owner.id)}>
              Supprimer
            </button>
          </li>
        ))}
        {owners.length === 0 ? <li className="text-sm text-slate-600">Aucun propriétaire.</li> : null}
      </ul>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
        <input className="sdg-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Prénom" />
        <input className="sdg-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nom" />
        <input className="sdg-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" type="email" />
        <input className="sdg-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone" />
        <button type="button" className="sdg-btn-primary" disabled={busy} onClick={() => void add()}>
          Ajouter
        </button>
      </div>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}

export function AdminEstablishmentsPage() {
  const [rows, setRows] = React.useState<EstablishmentRow[]>([]);
  const [owners, setOwners] = React.useState<Array<Owner & { establishments: Array<{ id: string; name: string }> }>>([]);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<RentalKind>("FURNISHED_TOURISM");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<EstablishmentRow | null>(null);

  const reload = React.useCallback(async () => {
    setError(null);
    const [data, people] = await Promise.all([api.adminEstablishments(), api.adminOwners()]);
    setRows(data);
    setOwners(people);
  }, []);

  React.useEffect(() => {
    void reload().catch((e: unknown) => {
      setError(e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "Erreur");
    });
  }, [reload]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Indique le nom de l’établissement.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminCreateEstablishment({ name: trimmed, rentalKind: kind });
      window.location.assign("/admin/etablissements");
    } catch (e: unknown) {
      setError(e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "Erreur");
      setBusy(false);
    }
  };

  const remove = async (row: EstablishmentRow) => {
    const confirmed = window.confirm(
      `Supprimer « ${row.name} » ? Les locataires, réservations, quittances et médias de cet établissement seront retirés.`
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminDeleteEstablishment(row.id);
      window.location.assign("/admin/etablissements");
    } catch (e: unknown) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  const activate = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.adminActivateEstablishment(id);
      window.location.assign("/admin/etablissements");
    } catch (e: unknown) {
      setError(e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "Erreur");
      setBusy(false);
    }
  };

  const active = rows.find((row) => row.active);

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Établissements</h1>
      <p className="sdg-subtitle mt-2">
        {active
          ? `Établissement en cours : ${active.name}. Le calendrier, les réservations, les médias et les paramètres suivent ce choix.`
          : "Crée un établissement, puis ouvre-le pour travailler dessus."}
      </p>

      <div className="sdg-card mt-6 p-4 md:p-6">
        <label className="sdg-label" htmlFor="est-name">
          Nouvel établissement
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input
            id="est-name"
            className="sdg-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de l’établissement"
            maxLength={120}
          />
          <div className="sm:w-72">
            <label className="sdg-label" htmlFor="est-kind">
              Type
            </label>
            <select id="est-kind" className="sdg-input" value={kind} onChange={(e) => setKind(e.target.value as RentalKind)}>
              <option value="FURNISHED_TOURISM">Meublé de tourisme</option>
              <option value="UNFURNISHED_MONTHLY">Logement loué vide au mois</option>
            </select>
          </div>
          <button type="button" className="sdg-btn-primary shrink-0" disabled={busy} onClick={() => void create()}>
            Créer et ouvrir
          </button>
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      </div>

      <OwnerDirectory owners={owners} onChanged={() => void reload()} />

      <div className="mt-4 grid grid-cols-1 gap-3">
        {rows.map((row) => (
          <article key={row.id} className="sdg-card flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">{row.name}</h2>
              <p className="text-sm text-slate-600">{row.address || row.studioName}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{kindLabel(row.rentalKind)}</p>
              {row.active ? <p className="mt-1 text-sm font-bold text-water-800">En cours</p> : null}
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button type="button" className="sdg-btn-soft" disabled={busy} onClick={() => setEditing(row)}>
                Modifier
              </button>
              {row.active ? null : (
                <button type="button" className="sdg-btn-soft" disabled={busy} onClick={() => void activate(row.id)}>
                  Ouvrir
                </button>
              )}
              <button type="button" className="sdg-btn-danger" disabled={busy} onClick={() => void remove(row)}>
                Supprimer
              </button>
            </div>
            </div>
            <EstablishmentOwners
              establishmentId={row.id}
              owners={row.owners ?? []}
              catalog={owners}
              onChanged={() => void reload()}
            />
            {row.rentalKind === "UNFURNISHED_MONTHLY" ? (
              <MonthlyTenants establishment={row} tenants={row.tenants ?? []} onChanged={() => void reload()} />
            ) : null}
          </article>
        ))}
        {rows.length === 0 ? <p className="text-sm text-slate-600">Aucun établissement.</p> : null}
      </div>
      {editing ? (
        <EditEstablishmentModal
          establishment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void reload()}
        />
      ) : null}
    </div>
  );
}
