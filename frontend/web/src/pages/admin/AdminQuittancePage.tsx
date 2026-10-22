import React from "react";
import { api, apiUrl } from "../../lib/api";
import { DateField } from "../../lib/dateField";

/**
 * Mentions du modèle 2026 (article 21 de la loi n° 89-462 du 6 juillet 1989) :
 * bailleur, locataire, logement, période, loyer et charges séparés, total reçu,
 * date, lieu, signature, réserve des termes antérieurs.
 * Service-Public, fiche « Quittance de loyer » vérifiée le 25 août 2025.
 * Une quittance n’est délivrée que pour un paiement intégral ; sinon c’est un reçu.
 */

type StayRow = {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  platform?: string | null;
  platformImageType?: string | null;
  user?: { email?: string | null; profileName?: string | null; phone?: string | null; residenceAddress?: string | null } | null;
};

type FeeLine = { label: string; priceCents: number };

const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize"
];

function frUnder100(n: number): string {
  if (n < 17) return UNITS[n] ?? "";
  if (n < 20) return `dix-${frUnder100(n - 10)}`;
  if (n < 70) {
    const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];
    const t = Math.floor(n / 10);
    const u = n % 10;
    const name = tens[t] ?? "";
    if (u === 0) return name;
    if (u === 1) return `${name} et un`;
    return `${name}-${frUnder100(u)}`;
  }
  if (n < 80) {
    if (n === 71) return "soixante et onze";
    return `soixante-${frUnder100(n - 60)}`;
  }
  if (n === 80) return "quatre-vingts";
  return `quatre-vingt-${frUnder100(n - 80)}`;
}

function frUnder1000(n: number): string {
  if (n < 100) return frUnder100(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const cent = hundreds === 1 ? "cent" : `${frUnder100(hundreds)} ${rest === 0 ? "cents" : "cent"}`;
  if (rest === 0) return cent;
  return `${cent} ${frUnder100(rest)}`;
}

function frInt(n: number): string {
  if (n < 1000) return frUnder1000(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const mil = thousands === 1 ? "mille" : `${frUnder1000(thousands)} mille`;
  if (rest === 0) return mil;
  return `${mil} ${frUnder1000(rest)}`;
}

function eurosToLetters(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const centimes = abs % 100;
  const euroWord = euros > 1 || euros === 0 ? "euros" : "euro";
  let text = `${frInt(euros)} ${euroWord}`;
  if (centimes > 0) {
    text += ` et ${frInt(centimes)} ${centimes > 1 ? "centimes" : "centime"}`;
  }
  return text;
}

function ymd(iso: string): string {
  return iso.slice(0, 10);
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatLong(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (!y || !m || !d) return dateYmd;
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mailFileAllowed(file: File): boolean {
  if (["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["pdf", "jpg", "jpeg", "png", "webp"].includes(ext)) return false;
  return file.type === "" || file.type === "application/octet-stream";
}

function parseEuroToCents(raw: string): number | null {
  const n = Number(String(raw).trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100);
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(yearMonth: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return null;
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const last = new Date(year, month, 0).getDate();
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(last).padStart(2, "0")}` };
}

function logementAddress(raw: string | null | undefined): string {
  const address = (raw ?? "").trim();
  if (!address) return "";
  if (/\b\d{5}\b/.test(address) || /balaruc/i.test(address)) return address;
  return `${address}, 34540 Balaruc-les-Bains`;
}

export function AdminQuittancePage() {
  const [stays, setStays] = React.useState<StayRow[]>([]);
  const [rentalKind, setRentalKind] = React.useState<"FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY">("FURNISHED_TOURISM");
  const [establishmentId, setEstablishmentId] = React.useState("");
  const [tenants, setTenants] = React.useState<Array<{ id: string; name: string; email: string | null; phone: string | null; formerAddress?: string | null }>>([]);
  const [tenantId, setTenantId] = React.useState("");
  const [month, setMonth] = React.useState(currentYearMonth);
  const [stayId, setStayId] = React.useState("");
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loadingStay, setLoadingStay] = React.useState(false);
  const [sendingMail, setSendingMail] = React.useState(false);
  const [mailFiles, setMailFiles] = React.useState<File[]>([]);
  const [mailStatus, setMailStatus] = React.useState<string | null>(null);
  const [feeLines, setFeeLines] = React.useState<FeeLine[]>([]);

  const [bailleurName, setBailleurName] = React.useState("");
  const [bailleurAddress, setBailleurAddress] = React.useState("");
  const [bailleurPhone, setBailleurPhone] = React.useState("");
  const [bailleurEmail, setBailleurEmail] = React.useState("");
  const [tenantName, setTenantName] = React.useState("");
  const [tenantEmail, setTenantEmail] = React.useState("");
  const [tenantAddress, setTenantAddress] = React.useState("");
  const [logement, setLogement] = React.useState("");
  const [periodFrom, setPeriodFrom] = React.useState("");
  const [periodTo, setPeriodTo] = React.useState("");
  const [rentInput, setRentInput] = React.useState("0,00");
  const [chargesInput, setChargesInput] = React.useState("0,00");
  const [receivedInput, setReceivedInput] = React.useState("0,00");
  const [paymentDate, setPaymentDate] = React.useState(todayYmd);
  const [paymentMethod, setPaymentMethod] = React.useState("Virement");
  const [place, setPlace] = React.useState("Balaruc-les-Bains");
  const [issueDate, setIssueDate] = React.useState(todayYmd);
  const [platformProof, setPlatformProof] = React.useState<{ platform: string; bookingId: string } | null>(null);
  const [bookingPlatform, setBookingPlatform] = React.useState<string | null>(null);
  const [signers, setSigners] = React.useState<Array<{ id: string; caption: string; role: string; hasSignature: boolean }>>([]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [bookings, settings, establishments] = await Promise.all([
          api.adminBookings() as Promise<StayRow[]>,
          api.adminGetSettings() as Promise<{
            ownerName?: string | null;
            address?: string | null;
            phone?: string | null;
            publicEmail?: string | null;
          } | null>,
          api.adminEstablishments()
        ]);
        if (cancelled) return;
        const today = todayYmd();
        const eligible = bookings
          .filter((b) => b.status === "CONFIRMED" && ymd(b.startDate) <= today)
          .sort((a, b) => ymd(b.startDate).localeCompare(ymd(a.startDate)));
        setStays(eligible);
        setBailleurName(settings?.ownerName?.trim() || "Studio des Grenadiers");
        setBailleurAddress(settings?.address?.trim() || "");
        setBailleurPhone(settings?.phone?.trim() || "");
        setBailleurEmail(settings?.publicEmail?.trim() || "");
        setLogement(logementAddress(settings?.address));
        const active = establishments.find((row) => row.active);
        if (active) {
          setEstablishmentId(active.id);
          setRentalKind(active.rentalKind);
          setSigners(
            (active.owners ?? []).map((owner) => ({
              id: owner.id,
              caption: `${owner.firstName} ${owner.lastName}`.trim(),
              role: owner.isCompany ? "Mandataire" : "Propriétaire",
              hasSignature: owner.hasSignature
            }))
          );
          if (active.rentalKind === "UNFURNISHED_MONTHLY") {
            const bounds = monthBounds(currentYearMonth());
            const list = active.tenants ?? [];
            setTenants(list);
            const first = list[0];
            setTenantId(first?.id ?? "");
            setTenantName(first?.name ?? "");
            setTenantEmail(first?.email ?? "");
            setTenantAddress(first?.formerAddress?.trim() ?? "");
            setRentInput(centsToInput(active.monthlyRentCents));
            setChargesInput(centsToInput(active.monthlyChargesCents));
            setReceivedInput(centsToInput(active.monthlyRentCents + active.monthlyChargesCents));
            if (bounds) {
              setMonth(currentYearMonth());
              setPeriodFrom(bounds.from);
              setPeriodTo(bounds.to);
            }
          }
        }
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "Erreur");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onPickStay = async (id: string) => {
    setStayId(id);
    setFeeLines([]);
    setMailStatus(null);
    setPlatformProof(null);
    setBookingPlatform(null);
    setTenantAddress("");
    if (!id) return;
    setLoadingStay(true);
    setLoadError(null);
    try {
      const detail = (await api.adminBookingDetail(id)) as {
        booking: StayRow;
        pricing: {
          totalCents: number;
          ancillaryTotalCents: number;
          ancillaryFees?: FeeLine[];
        };
      };
      const rent = detail.pricing.totalCents ?? 0;
      const charges = detail.pricing.ancillaryTotalCents ?? 0;
      setTenantName(detail.booking.user?.profileName?.trim() || "");
      setTenantEmail(detail.booking.user?.email?.trim() || "");
      setTenantAddress(detail.booking.user?.residenceAddress?.trim() || "");
      setPeriodFrom(ymd(detail.booking.startDate));
      setPeriodTo(ymd(detail.booking.endDate));
      setRentInput(centsToInput(rent));
      setChargesInput(centsToInput(charges));
      setReceivedInput(centsToInput(rent + charges));
      setFeeLines(Array.isArray(detail.pricing.ancillaryFees) ? detail.pricing.ancillaryFees : []);
      const platform = detail.booking.platform?.trim() || null;
      setBookingPlatform(platform);
      if (platform && detail.booking.platformImageType) {
        setPlatformProof({ platform, bookingId: id });
      }
    } catch (e: unknown) {
      setLoadError(e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "Erreur");
    } finally {
      setLoadingStay(false);
    }
  };

  const rentCents = parseEuroToCents(rentInput);
  const chargesCents = parseEuroToCents(chargesInput);
  const receivedCents = parseEuroToCents(receivedInput);
  const feesSum = feeLines.reduce((sum, fee) => sum + (fee.priceCents || 0), 0);
  const showFees = chargesCents != null && feeLines.length > 0 && chargesCents === feesSum;
  const amountsOk = rentCents != null && chargesCents != null && receivedCents != null && periodFrom && periodTo && periodTo > periodFrom;
  const dueCents = amountsOk ? rentCents + chargesCents : 0;
  const fullPayment = amountsOk && receivedCents >= dueCents && dueCents > 0;
  const partial = amountsOk && receivedCents < dueCents;
  const platformStay = Boolean(bookingPlatform && periodFrom && periodTo && periodTo > periodFrom);
  const showDocument = platformStay || (amountsOk && dueCents > 0);
  const docTitle = bookingPlatform || fullPayment ? "Quittance de loyer" : "Reçu de loyer";
  const monthly = rentalKind === "UNFURNISHED_MONTHLY";

  const applyMonth = (yearMonth: string) => {
    const bounds = monthBounds(yearMonth);
    if (!bounds || bounds.from > todayYmd()) return;
    setMonth(yearMonth);
    setPeriodFrom(bounds.from);
    setPeriodTo(bounds.to);
    setMailStatus(null);
  };

  const saveLease = async () => {
    if (!establishmentId || rentCents == null || chargesCents == null) return;
    setLoadError(null);
    try {
      await api.adminUpdateEstablishment(establishmentId, {
        monthlyRentCents: rentCents,
        monthlyChargesCents: chargesCents
      });
      setMailStatus("Loyer du bail enregistré. Il sera repris le mois suivant.");
    } catch (e: unknown) {
      setLoadError(e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "Erreur");
    }
  };

  const sendByEmail = async () => {
    if (rentCents == null || chargesCents == null || receivedCents == null || !amountsOk) return;
    if (!bookingPlatform && dueCents === 0) return;
    if (!monthly && !stayId) return;
    if (monthly && !tenantId) return;
    if (mailFiles.length > 8) {
      setMailStatus("Huit pièces jointes au maximum.");
      return;
    }
    for (const file of mailFiles) {
      if (!mailFileAllowed(file)) {
        setMailStatus("Les pièces jointes doivent être un PDF, un JPEG, un PNG ou un WebP.");
        return;
      }
      if (file.size > 8_000_000) {
        setMailStatus("Une pièce jointe dépasse 8 Mo.");
        return;
      }
    }
    setSendingMail(true);
    setMailStatus(null);
    try {
      const payload = {
        bailleurName: bailleurName.trim(),
        bailleurAddress: bailleurAddress.trim(),
        bailleurPhone: bailleurPhone.trim(),
        bailleurEmail: bailleurEmail.trim(),
        tenantName: tenantName.trim(),
        logement: logement.trim(),
        periodFrom,
        periodTo,
        rentCents,
        chargesCents,
        receivedCents,
        paymentDate,
        paymentMethod,
        place: place.trim(),
        issueDate,
        feeLines: showFees ? feeLines.map((fee) => ({ label: fee.label, priceCents: fee.priceCents })) : []
      };
      const res = monthly
        ? await api.adminSendMonthlyQuittance({ ...payload, tenantId, tenantEmail: tenantEmail.trim() }, mailFiles)
        : await api.adminSendQuittance(stayId, payload, mailFiles);
      const owners = res.owners?.length
        ? ` Copie envoyée ${res.owners.length > 1 ? "aux propriétaires" : "au propriétaire"} ${res.owners.join(", ")}.`
        : "";
      setMailFiles([]);
      setMailStatus(`${fullPayment ? "Quittance" : "Reçu"} envoyé à ${res.to}.${owners}`);
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "";
      if (code === "MAIL_DISABLED") setMailStatus("L’envoi d’e-mail n’est pas configuré.");
      else if (code === "MAIL_SEND_FAILED") setMailStatus("Le serveur de messagerie a refusé l’envoi. Réessayez dans un instant.");
      else if (code === "NO_GUEST_EMAIL") setMailStatus("Ce locataire n’a pas d’adresse e-mail.");
      else if (code === "VALIDATION_ERROR") setMailStatus("Les informations de la quittance sont incomplètes.");
      else if (code === "NOT_FOUND") setMailStatus("Cette réservation est introuvable pour l’établissement ouvert.");
      else if (code === "STAY_NOT_STARTED") setMailStatus("Le séjour n’a pas encore commencé.");
      else if (code === "STAY_NOT_CONFIRMED") setMailStatus("La réservation n’est pas confirmée.");
      else if (code === "ATTACHMENT_TYPE") setMailStatus("Les pièces jointes doivent être un PDF, un JPEG, un PNG ou un WebP.");
      else if (code === "ATTACHMENT_TOO_LARGE") setMailStatus("Une pièce jointe dépasse 8 Mo.");
      else if (code === "TOO_MANY_ATTACHMENTS") setMailStatus("Huit pièces jointes au maximum.");
      else setMailStatus("L’envoi a échoué.");
    } finally {
      setSendingMail(false);
    }
  };

  const stayLabel = (b: StayRow) => {
    const today = todayYmd();
    const end = ymd(b.endDate);
    const state = end <= today ? "passé" : "en cours";
    const who = b.user?.profileName?.trim() || b.user?.email || "Client";
    return `${who} — du ${formatLong(ymd(b.startDate))} au ${formatLong(end)} (${state})`;
  };

  return (
    <div className="sdg-container sdg-quittance-page py-10">
      <div className="sdg-quittance-ui">
        <h1 className="sdg-title">Quittance</h1>
        <p className="sdg-subtitle mt-2">
          {monthly
            ? "Quittance de loyer pour chaque mois du logement loué vide. Le loyer et les charges sont séparés, comme l’exige l’article 21 de la loi du 6 juillet 1989."
            : "Quittance de loyer pour un séjour confirmé, passé ou en cours. Le loyer et les charges sont séparés, comme l’exige l’article 21 de la loi du 6 juillet 1989."}
        </p>

        <div className="sdg-card mt-6 p-4 md:p-6">
          {monthly ? (
            <>
              <label className="sdg-label" htmlFor="quittance-tenant">
                Locataire
              </label>
              <select
                id="quittance-tenant"
                className="sdg-input mb-3"
                value={tenantId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTenantId(id);
                  const tenant = tenants.find((item) => item.id === id);
                  setTenantName(tenant?.name ?? "");
                  setTenantEmail(tenant?.email ?? "");
                  setTenantAddress(tenant?.formerAddress?.trim() ?? "");
                  setMailStatus(null);
                }}
              >
                <option value="">Choisir un locataire rattaché</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                    {tenant.email ? ` — ${tenant.email}` : ""}
                  </option>
                ))}
              </select>
              {tenants.length === 0 ? (
                <p className="mb-3 text-sm text-slate-600">Aucun locataire. Ajoute-le sur la page Établissements.</p>
              ) : null}
              <label className="sdg-label" htmlFor="quittance-month">
                Mois
              </label>
              <DateField
                id="quittance-month"
                className="sdg-input"
                value={month ? `${month}-01` : ""}
                onChange={(ymd) => {
                  if (ymd) applyMonth(ymd.slice(0, 7));
                }}
              />
            </>
          ) : (
            <>
              <label className="sdg-label" htmlFor="quittance-stay">
                Séjour
              </label>
              <select
                id="quittance-stay"
                className="sdg-input"
                value={stayId}
                onChange={(e) => void onPickStay(e.target.value)}
              >
                <option value="">Choisir un séjour passé ou en cours</option>
                {stays.map((b) => (
                  <option key={b.id} value={b.id}>
                    {stayLabel(b)}
                  </option>
                ))}
              </select>
              {stays.length === 0 ? <p className="mt-2 text-sm text-slate-600">Aucun séjour confirmé déjà commencé.</p> : null}
            </>
          )}
          {loadingStay ? <p className="mt-2 text-sm font-semibold text-slate-700">Chargement du séjour…</p> : null}
          {loadError ? <p className="mt-2 text-sm font-semibold text-rose-700">{loadError}</p> : null}

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="sdg-label" htmlFor="q-bailleur">
                Bailleur
              </label>
              <input id="q-bailleur" className="sdg-input" value={bailleurName} onChange={(e) => setBailleurName(e.target.value)} />
            </div>
            <div>
              <label className="sdg-label" htmlFor="q-bailleur-addr">
                Adresse du bailleur
              </label>
              <input
                id="q-bailleur-addr"
                className="sdg-input"
                value={bailleurAddress}
                onChange={(e) => setBailleurAddress(e.target.value)}
                placeholder="Adresse postale du bailleur"
              />
            </div>
            <div>
              <label className="sdg-label" htmlFor="q-tenant">
                Locataire
              </label>
              <input id="q-tenant" className="sdg-input" value={tenantName} readOnly={monthly} onChange={(e) => setTenantName(e.target.value)} />
            </div>
            {monthly ? (
              <div>
                <label className="sdg-label" htmlFor="q-tenant-email">
                  E-mail du locataire
                </label>
                <input
                  id="q-tenant-email"
                  className="sdg-input"
                  type="email"
                  value={tenantEmail}
                  readOnly
                  onChange={(e) => setTenantEmail(e.target.value)}
                />
              </div>
            ) : null}
            <div>
              <label className="sdg-label" htmlFor="q-logement">
                Logement loué
              </label>
              <input id="q-logement" className="sdg-input" value={logement} onChange={(e) => setLogement(e.target.value)} />
            </div>
            <div>
              <label className="sdg-label" htmlFor="q-from">
                Début de la période
              </label>
              <DateField id="q-from" className="sdg-input" value={periodFrom} disabled={monthly} onChange={setPeriodFrom} />
            </div>
            <div>
              <label className="sdg-label" htmlFor="q-to">
                Fin de la période (départ)
              </label>
              <DateField id="q-to" className="sdg-input" value={periodTo} disabled={monthly} onChange={setPeriodTo} />
            </div>
            {platformProof ? (
              <div className="md:col-span-2">
                <p className="sdg-label">Capture {platformProof.platform}</p>
                <img
                  alt={`Capture ${platformProof.platform}`}
                  className="mt-2 max-h-72 rounded-xl border border-slate-200"
                  src={apiUrl(`/api/admin/bookings/${platformProof.bookingId}/platform-image`)}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="sdg-label" htmlFor="q-rent">
                    Loyer hors charges (€)
                  </label>
                  <input id="q-rent" className="sdg-input" inputMode="decimal" value={rentInput} onChange={(e) => setRentInput(e.target.value)} />
                </div>
                <div>
                  <label className="sdg-label" htmlFor="q-charges">
                    Provisions pour charges (€)
                  </label>
                  <input
                    id="q-charges"
                    className="sdg-input"
                    inputMode="decimal"
                    value={chargesInput}
                    onChange={(e) => setChargesInput(e.target.value)}
                  />
                  {showFees ? (
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      Frais du séjour : {feeLines.map((f) => `${f.label} ${formatMoney(f.priceCents)} €`).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="sdg-label" htmlFor="q-received">
                    Somme reçue (€)
                  </label>
                  <input
                    id="q-received"
                    className="sdg-input"
                    inputMode="decimal"
                    value={receivedInput}
                    onChange={(e) => setReceivedInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="sdg-label" htmlFor="q-method">
                    Mode de paiement
                  </label>
                  <select id="q-method" className="sdg-input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option>Virement</option>
                    <option>Carte bancaire</option>
                    <option>Chèque</option>
                    <option>Espèces</option>
                    <option>Autre</option>
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="sdg-label" htmlFor="q-paid">
                Date du paiement
              </label>
              <DateField id="q-paid" className="sdg-input" value={paymentDate} onChange={setPaymentDate} />
            </div>
            <div>
              <label className="sdg-label" htmlFor="q-place">
                Fait à
              </label>
              <input id="q-place" className="sdg-input" value={place} onChange={(e) => setPlace(e.target.value)} />
            </div>
            <div>
              <label className="sdg-label" htmlFor="q-issued">
                Date de la quittance
              </label>
              <DateField id="q-issued" className="sdg-input" value={issueDate} onChange={setIssueDate} />
            </div>
          </div>

          {partial && !bookingPlatform ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
              La somme reçue est inférieure au total. Le document devient un reçu, avec le solde restant dû. Une quittance ne se délivre que pour un paiement intégral.
            </p>
          ) : null}
          {amountsOk && dueCents === 0 && !bookingPlatform ? (
            <p className="mt-4 text-sm font-semibold text-rose-700">Indique un loyer ou des charges supérieurs à zéro.</p>
          ) : null}

          <div className="mt-5">
            <label className="sdg-label" htmlFor="quittance-attachments">
              Pièces jointes (optionnel)
            </label>
            <input
              id="quittance-attachments"
              className="mt-1 block w-full text-sm text-slate-700"
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setMailFiles((current) => [...current, ...picked].slice(0, 8));
                e.target.value = "";
              }}
            />
            {mailFiles.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {mailFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      className="sdg-btn-soft !px-2 !py-1 text-xs"
                      onClick={() => setMailFiles((current) => current.filter((_, item) => item !== index))}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-slate-600">PDF, JPEG, PNG ou WebP. Huit fichiers au maximum, 8 Mo chacun. Ils s’ajoutent au PDF de la quittance.</p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" className="sdg-btn-primary" onClick={() => window.print()} disabled={!showDocument}>
              Imprimer ou enregistrer en PDF
            </button>
            <button
              type="button"
              className="sdg-btn-soft"
              disabled={
                (monthly ? !tenantId : !stayId) ||
                !tenantEmail.trim() ||
                !tenantName.trim() ||
                !bailleurName.trim() ||
                !logement.trim() ||
                !place.trim() ||
                sendingMail ||
                !amountsOk ||
                (!bookingPlatform && dueCents === 0) ||
                rentCents == null ||
                chargesCents == null ||
                receivedCents == null
              }
              onClick={() => void sendByEmail()}
            >
              {sendingMail ? "Envoi…" : "Envoyer par e-mail"}
            </button>
          </div>
          {(monthly || stayId) && tenantEmail.trim() ? (
            <p className="mt-2 text-sm text-slate-600">Destinataire : {tenantEmail.trim()}</p>
          ) : null}
          {(monthly || stayId) && !tenantEmail.trim() ? (
            <p className="mt-2 text-sm font-semibold text-rose-700">Ce locataire n’a pas d’adresse e-mail.</p>
          ) : null}
          {monthly && establishmentId ? (
            <button
              type="button"
              className="sdg-btn-soft mt-3"
              onClick={() => void saveLease()}
            >
              Enregistrer le loyer du bail
            </button>
          ) : null}
          {mailStatus ? <p className="mt-2 text-sm font-semibold text-slate-800">{mailStatus}</p> : null}
        </div>
      </div>

      <article className="sdg-quittance-sheet mx-auto mt-8 max-w-[210mm] bg-white p-8 text-slate-950 shadow-xl md:p-12">
        <header className="border-b border-slate-300 pb-4 text-center">
          <h2 className="font-serif text-2xl font-bold uppercase tracking-wide">{docTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">{monthly ? "Location vide — loyer du mois" : "Location meublée — séjour"}</p>
        </header>

        {showDocument ? (
          <div className="mt-6 space-y-4 text-[15px] leading-relaxed">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Bailleur</h3>
                <p className="mt-1 font-semibold">{bailleurName || "—"}</p>
                {bailleurAddress ? <p>{bailleurAddress}</p> : null}
                {bailleurPhone ? <p>{bailleurPhone}</p> : null}
                {bailleurEmail ? <p>{bailleurEmail}</p> : null}
              </section>
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Locataire</h3>
                <p className="mt-1 font-semibold">{tenantName || "—"}</p>
                {tenantAddress ? <p className="whitespace-pre-wrap">{tenantAddress}</p> : null}
                {tenantEmail ? <p>{tenantEmail}</p> : null}
              </section>
            </div>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Logement loué</h3>
              <p className="mt-1">{logement || "—"}</p>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Période concernée</h3>
              <p className="mt-1">
                Du {formatLong(periodFrom)} au {formatLong(periodTo)}
              </p>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Détail des sommes</h3>
              {platformProof ? (
                <img
                  alt={`Capture ${platformProof.platform}`}
                  className="mt-2 max-h-80 rounded-xl border border-slate-200"
                  src={apiUrl(`/api/admin/bookings/${platformProof.bookingId}/platform-image`)}
                />
              ) : amountsOk ? (
                <table className="mt-2 w-full border-collapse text-left">
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-3 font-semibold">Loyer hors charges</th>
                      <td className="py-2 text-right tabular-nums">{formatMoney(rentCents)} €</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-3 font-semibold">Provisions pour charges</th>
                      <td className="py-2 text-right tabular-nums">{formatMoney(chargesCents)} €</td>
                    </tr>
                    {showFees
                      ? feeLines.map((f, index) => (
                          <tr key={`${f.label}-${index}`} className="border-b border-slate-100 text-sm text-slate-600">
                            <th className="py-1 pl-4 pr-3 font-medium">dont {f.label}</th>
                            <td className="py-1 text-right tabular-nums">{formatMoney(f.priceCents)} €</td>
                          </tr>
                        ))
                      : null}
                    <tr>
                      <th className="py-2 pr-3 font-bold">Total dû</th>
                      <td className="py-2 text-right font-bold tabular-nums">{formatMoney(dueCents)} €</td>
                    </tr>
                    <tr>
                      <th className="py-2 pr-3 font-bold">Somme reçue</th>
                      <td className="py-2 text-right font-bold tabular-nums">{formatMoney(receivedCents)} €</td>
                    </tr>
                    {partial ? (
                      <tr>
                        <th className="py-2 pr-3 font-bold">Solde restant dû</th>
                        <td className="py-2 text-right font-bold tabular-nums">{formatMoney(dueCents - receivedCents)} €</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              ) : null}
            </section>

            <p>
              {bookingPlatform
                ? `Je soussigné(e) ${bailleurName || "…"}, bailleur du logement désigné ci-dessus, déclare avoir loué le logement ci-dessus dans la période mentionnée ci-dessus, selon les modalités de la plateforme ${bookingPlatform}.`
                : `Je soussigné(e) ${bailleurName || "…"}, bailleur du logement désigné ci-dessus, déclare avoir reçu de ${tenantName || "…"} la somme de ${eurosToLetters(receivedCents)} (${formatMoney(receivedCents)} €)${fullPayment ? " au titre du loyer et des charges pour la période indiquée, et lui en donne quittance, sous réserve de tous mes droits." : " à valoir sur le loyer et les charges de la période indiquée."}`}
            </p>

            {bookingPlatform ? null : fullPayment ? (
              <p>Cette quittance ne présume pas du paiement des termes antérieurs et ne vaut pas titre définitif.</p>
            ) : (
              <p>
                Le présent document est un reçu, et non une quittance : le loyer et les charges de la période ne sont pas intégralement payés.
              </p>
            )}

            <p>
              {bookingPlatform
                ? `Paiement reçu selon les modalités de la plateforme ${bookingPlatform}.`
                : `Paiement reçu le ${paymentDate ? formatLong(paymentDate) : "…"}${paymentMethod ? ` par ${paymentMethod.toLocaleLowerCase("fr-FR")}` : ""}.`}
            </p>

            <p className="pt-4">
              Fait à {place || "…"}, le {issueDate ? formatLong(issueDate) : "…"}
            </p>

            <div className="mt-6 flex flex-wrap justify-end gap-6">
              {(signers.length > 0 ? signers : [{ id: "", caption: bailleurName, role: "Propriétaire", hasSignature: false }]).map((signer) => (
                <div key={signer.id || "bailleur"} className="w-44 text-center">
                  <p className="text-sm font-semibold">Signature</p>
                  {signer.hasSignature ? (
                    <img
                      alt={`Signature de ${signer.caption}`}
                      className="mx-auto mt-2 h-16 w-full object-contain"
                      src={apiUrl(`/api/admin/directory/owners/${signer.id}/signature`)}
                    />
                  ) : (
                    <div className="mt-10 border-b border-slate-800" />
                  )}
                  <p className="mt-2 text-sm font-semibold">{signer.caption}</p>
                  <p className="text-xs text-slate-600">{signer.role}</p>
                </div>
              ))}
            </div>

            {monthly ? (
              <p className="pt-6 text-xs leading-snug text-slate-500">
                Document établi conformément à l’article 21 de la loi n° 89-462 du 6 juillet 1989 : détail du loyer et des charges, remis gratuitement. Modèle aligné sur la fiche Service-Public vérifiée le 25 août 2025 et sur les mentions du modèle de quittance 2026.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="sdg-quittance-ui mt-8 text-sm text-slate-600">
            {monthly ? "Indique le loyer du mois pour afficher la quittance." : "Choisis un séjour pour afficher la quittance."}
          </p>
        )}
      </article>
    </div>
  );
}
