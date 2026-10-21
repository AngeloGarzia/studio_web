import React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { DateClickArg, DateSelectArg } from "@fullcalendar/interaction";
import multiMonthPlugin from "@fullcalendar/multimonth";
import { api } from "../../lib/api";
import { DEFAULT_BOOKING_PLATFORM, MAIN_BOOKING_PLATFORMS, OTHER_BOOKING_PLATFORMS } from "../../lib/bookingPlatforms";
import { DateField } from "../../lib/dateField";

function localDayKey(d: Date) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Jour suivant / précédent en calendrier local (cohérent avec FullCalendar dateStr). */
function addWallDaysYmd(ymd: string, deltaDays: number): string {
  const [ys, ms, ds] = ymd.slice(0, 10).split("-");
  const t = new Date(Number(ys), Number(ms) - 1, Number(ds) + deltaDays);
  return localDayKey(t);
}

/** Clé yyyy-mm-dd alignée sur le stockage API (jour à minuit UTC). */
function dbNightYmd(d: Date | string) {
  return new Date(d).toISOString().slice(0, 10);
}

/** Jour civil de la case FC (priorité dateStr) — évite mélange J/J+1 vs UTC sur la cellule. */
function fcCellYmd(arg: { date: Date; dateStr?: string }): string {
  const s = arg.dateStr?.trim();
  if (s && s.length >= 10) return s.slice(0, 10);
  return localDayKey(arg.date);
}

function addDaysLocal(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function bookingCoveringDay(bookings: Array<{ status?: string; startDate: string; endDate: string }>, dayKey: string) {
  let found: (typeof bookings)[number] | null = null;
  for (const b of bookings) {
    if (b.status !== "CONFIRMED" && b.status !== "PENDING") continue;
    const start = new Date(b.startDate);
    const end = new Date(b.endDate);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
    let covers = false;
    for (let d = new Date(start); d < end; d = addDaysLocal(d, 1)) {
      if (localDayKey(d) === dayKey) {
        covers = true;
        break;
      }
    }
    if (!covers) continue;
    if (!found || b.status === "CONFIRMED") found = b;
  }
  return found;
}

/** « Prénom Nom » → prénom, puis le reste du nom en dessous. */
function splitClientName(label: string): { first: string; last: string } {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? label, last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

type BookingClient = {
  id: string;
  email: string;
  profileName: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  residenceAddress: string | null;
};

function clientNameParts(client: { firstName?: string | null; lastName?: string | null; profileName?: string | null }) {
  if (client.firstName?.trim() || client.lastName?.trim()) {
    return { firstName: client.firstName?.trim() ?? "", lastName: client.lastName?.trim() ?? "" };
  }
  const split = splitClientName(client.profileName ?? "");
  return { firstName: split.first, lastName: split.last };
}

function clientLabel(client: BookingClient) {
  const names = clientNameParts(client);
  return [names.firstName, names.lastName].filter(Boolean).join(" ") || client.profileName?.trim() || client.email;
}

function textWiderThan(container: HTMLElement, text: string) {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "nowrap";
  probe.style.pointerEvents = "none";
  probe.style.font = "inherit";
  probe.textContent = text;
  container.appendChild(probe);
  const overflows = probe.offsetWidth > container.clientWidth + 1;
  probe.remove();
  return overflows;
}

function DayClientCard({
  booking,
  fallbackName
}: {
  booking: { user?: { profileName?: string | null; email?: string | null; phone?: string | null } } | null;
  fallbackName: string;
}) {
  const name = booking?.user?.profileName?.trim() || fallbackName;
  const email = booking?.user?.email?.trim() || "";
  const phone = booking?.user?.phone?.trim() || "";
  const tel = phone.replace(/[^\d+]/g, "");

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white/70 p-3 text-sm text-slate-800">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Client</div>
      <div className="mt-1 font-semibold text-slate-900">{name}</div>
      <div className="mt-2">
        <span className="font-semibold">Téléphone : </span>
        {tel ? (
          <a className="font-semibold text-water-700 underline decoration-water-400/70 hover:text-water-900" href={`tel:${tel}`}>
            {phone}
          </a>
        ) : (
          "—"
        )}
      </div>
      <div className="mt-1">
        <span className="font-semibold">E-mail : </span>
        {email ? (
          <a className="font-semibold text-water-700 underline decoration-water-400/70 hover:text-water-900" href={`mailto:${email}`}>
            {email}
          </a>
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}

function ClientDayName({ label, onOpen }: { label: string; onOpen?: () => void }) {
  const { first, last } = splitClientName(label);
  const ref = React.useRef<HTMLButtonElement>(null);
  const [compact, setCompact] = React.useState(false);
  const initial = first.charAt(0).toLocaleUpperCase("fr-FR");
  const compactText = last ? `${initial}. ${last}` : first;

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (!last || el.clientWidth <= 0) {
        setCompact(false);
        return;
      }
      setCompact(textWiderThan(el, first) || textWiderThan(el, last));
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [first, last]);

  return (
    <button
      ref={ref}
      type="button"
      className="w-full max-w-full cursor-pointer self-stretch text-center text-[11px] font-bold leading-tight text-slate-700"
      title={`Modifier la réservation de ${label}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen?.();
      }}
    >
      {compact ? (
        <div className="break-words">{compactText}</div>
      ) : (
        <>
          <div className="truncate">{first}</div>
          {last ? <div className="truncate">{last}</div> : null}
        </>
      )}
    </button>
  );
}

function countInclusiveWallDays(fromYmd: string, toYmd: string): number {
  if (fromYmd > toYmd) return 0;
  let n = 0;
  let cur = fromYmd;
  while (true) {
    n++;
    if (cur === toYmd) break;
    cur = addWallDaysYmd(cur, 1);
    if (n > 4000) break;
  }
  return n;
}

function addBookingError(code: string): string {
  if (code === "DATES_UNAVAILABLE") return "Ces dates ne sont pas libres.";
  if (code === "ARRIVAL_NOT_ALLOWED") return "L’arrivée n’est pas autorisée ce jour.";
  if (code === "DEPARTURE_NOT_ALLOWED") return "Le départ n’est pas autorisé ce jour.";
  if (code === "CLIENT_NOT_FOUND") return "Ce client n’est plus en base.";
  if (code === "EMAIL_TAKEN") return "Cet email appartient déjà à un compte qui n’est pas un client.";
  if (code === "VALIDATION_ERROR") return "Vérifie les dates et les informations du client.";
  if (code === "IMAGE_TYPE") return "L’image doit être un JPEG, un PNG ou un WebP.";
  if (code === "IMAGE_TOO_LARGE") return "L’image dépasse 8 Mo.";
  if (code === "PLATFORM_REQUIRED") return "Choisis d’abord une plateforme.";
  return "Impossible d’enregistrer la réservation.";
}

function sortNightYmd(keys: Iterable<string>): string[] {
  return [
    ...new Set(
      [...keys]
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.slice(0, 10))
        .filter(Boolean)
    )
  ].sort();
}

/** Plages maximales adjacentes dans le calendrier local (pour appels API un range par groupe). */
function chunksContiguousWallDays(sortedYmds: string[]): string[][] {
  if (sortedYmds.length === 0) return [];
  const out: string[][] = [];
  let cur = [sortedYmds[0]!];
  for (let i = 1; i < sortedYmds.length; i++) {
    const y = sortedYmds[i]!;
    if (addWallDaysYmd(cur[cur.length - 1]!, 1) === y) cur.push(y);
    else {
      out.push(cur);
      cur = [y];
    }
  }
  out.push(cur);
  return out;
}

/** Nuits [startStr, endStr) en jours calendaires locaux (fin exclusive, convention FullCalendar). */
function eachNightBetweenWall(startStr: string, endExclusiveStr: string): string[] {
  if (typeof startStr !== "string" || typeof endExclusiveStr !== "string") return [];
  const from = startStr.slice(0, 10);
  const endEx = endExclusiveStr.slice(0, 10);
  if (from.length !== 10 || endEx.length !== 10) return [];
  const nights: string[] = [];
  for (let cur = from; cur < endEx; cur = addWallDaysYmd(cur, 1)) {
    nights.push(cur);
    if (nights.length > 3700) break;
  }
  return nights;
}

function isoRangeTouchesBlock(startISO: Date, endISO: Date, blocks: unknown[]): boolean {
  return (blocks ?? []).some(
    (blk: any) => new Date(blk.startDate) < endISO && new Date(blk.endDate) > startISO
  );
}

const ADMIN_DAY_DBLCLICK_KEY = "__sdgAdminDayDblclick__" as const;

function NoEntryIcon({ title, className }: { title: string; className: string }) {
  return (
    <svg
      aria-label={title}
      role="img"
      title={title}
      viewBox="0 0 24 24"
      className={`h-4 w-4 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
      <path d="M7.5 16.5L16.5 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function AdminCalendarPage() {
  const [wide, setWide] = React.useState<boolean>(() => (typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false));
  const calRef = React.useRef<FullCalendar | null>(null);
  /** Évite que `dateClick` annule ou double-traitent juste après un `select` (glisser). */
  const suppressDateClickUntilRef = React.useRef(0);
  const [visibleRange, setVisibleRange] = React.useState<{ from: string; to: string } | null>(null);
  const [cal, setCal] = React.useState<any>(null);
  const [bookings, setBookings] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [blockReason, setBlockReason] = React.useState("");
  const [periodSelectedYmd, setPeriodSelectedYmd] = React.useState<string[]>([]);
  const [price, setPrice] = React.useState("80");
  const [arrivalAllowed, setArrivalAllowed] = React.useState(true);
  const [departureAllowed, setDepartureAllowed] = React.useState(true);
  const [promoPercent, setPromoPercent] = React.useState<string>("");
  const [promoLabel, setPromoLabel] = React.useState<string>("");
  const [dayModalKey, setDayModalKey] = React.useState<string | null>(null); // YYYY-MM-DD
  const [dayBlocked, setDayBlocked] = React.useState(false);
  const [dayWho, setDayWho] = React.useState<string | null>(null);
  const [dayLoading, setDayLoading] = React.useState(false);
  const [bookingModalId, setBookingModalId] = React.useState<string | null>(null);
  const [bookingModalData, setBookingModalData] = React.useState<any>(null);
  const [bookingLoading, setBookingLoading] = React.useState(false);
  const [bookingSearch, setBookingSearch] = React.useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = React.useState<"ALL" | "CONFIRMED" | "PENDING" | "CANCELLED">("ALL");
  const [mailSendingId, setMailSendingId] = React.useState<string | null>(null);
  const [mailStatusById, setMailStatusById] = React.useState<Record<string, string>>({});
  const [proposal, setProposal] = React.useState<{
    id: string;
    guest: string;
    requestedLabel: string;
    proposedStart: string;
    proposedEnd: string;
    message: string;
  } | null>(null);
  const [proposalSending, setProposalSending] = React.useState(false);
  const [proposalError, setProposalError] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addSaving, setAddSaving] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [addNotice, setAddNotice] = React.useState<string | null>(null);
  const [platformFile, setPlatformFile] = React.useState<File | null>(null);
  const [platformPreview, setPlatformPreview] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editLoading, setEditLoading] = React.useState(false);
  const [editSaving, setEditSaving] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editFile, setEditFile] = React.useState<File | null>(null);
  const [editPreview, setEditPreview] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState({
    id: "",
    start: "",
    end: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    residenceAddress: "",
    platformEnabled: false,
    platform: DEFAULT_BOOKING_PLATFORM,
    notes: "",
    hasImage: false
  });
  const [clients, setClients] = React.useState<BookingClient[]>([]);
  const [addForm, setAddForm] = React.useState({
    start: "",
    end: "",
    mode: "existing" as "existing" | "new",
    clientId: "",
    query: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    residenceAddress: "",
    platformEnabled: false,
    platform: DEFAULT_BOOKING_PLATFORM,
    notes: ""
  });

  const [stayPromoRules, setStayPromoRules] = React.useState<any[]>([]);
  const [stayPromoErr, setStayPromoErr] = React.useState<string | null>(null);
  const [stayPromoSaving, setStayPromoSaving] = React.useState(false);
  const [stayPromoEditId, setStayPromoEditId] = React.useState<string | null>(null);
  const [spValidFrom, setSpValidFrom] = React.useState("");
  const [spValidTo, setSpValidTo] = React.useState("");
  const [spMinNights, setSpMinNights] = React.useState("21");
  const [spPromoPct, setSpPromoPct] = React.useState("10");
  const [spLabel, setSpLabel] = React.useState("");
  const [spActive, setSpActive] = React.useState(true);

  const resetStayPromoForm = React.useCallback(() => {
    setStayPromoEditId(null);
    setSpValidFrom("");
    setSpValidTo("");
    setSpMinNights("21");
    setSpPromoPct("10");
    setSpLabel("");
    setSpActive(true);
  }, []);

  const loadStayPromoRules = React.useCallback(async () => {
    try {
      const rows = await api.adminStayPromoRules();
      setStayPromoRules(Array.isArray(rows) ? rows : []);
    } catch {
      setStayPromoRules([]);
    }
  }, []);

  React.useEffect(() => {
    void loadStayPromoRules();
  }, [loadStayPromoRules]);

  const startEditStayPromo = React.useCallback((r: any) => {
    setStayPromoEditId(r.id);
    setSpValidFrom(new Date(r.validFrom).toISOString().slice(0, 10));
    setSpValidTo(new Date(r.validToInclusive).toISOString().slice(0, 10));
    setSpMinNights(String(r.minStayNights));
    setSpPromoPct(String(r.promoPercent));
    setSpLabel(r.label ?? "");
    setSpActive(Boolean(r.active));
  }, []);

  const upsertStayPromo = React.useCallback(async () => {
    setStayPromoErr(null);
    setStayPromoSaving(true);
    try {
      const minNights = Number(spMinNights);
      const pct = Number(spPromoPct);
      if (!Number.isFinite(minNights) || minNights < 1) throw new Error("Durée minimale invalide");
      if (!Number.isFinite(pct) || pct < 1 || pct > 100) throw new Error("Pourcentage invalide (1–100)");
      if (!spValidFrom || !spValidTo || spValidFrom > spValidTo) throw new Error("Période invalide");

      if (stayPromoEditId) {
        await api.adminUpdateStayPromoRule(stayPromoEditId, {
          validFrom: spValidFrom,
          validToInclusive: spValidTo,
          minStayNights: minNights,
          promoPercent: pct,
          label: spLabel.trim() || null,
          active: spActive
        });
      } else {
        await api.adminCreateStayPromoRule({
          validFrom: spValidFrom,
          validToInclusive: spValidTo,
          minStayNights: minNights,
          promoPercent: pct,
          label: spLabel.trim() || null,
          active: spActive
        });
      }
      resetStayPromoForm();
      await loadStayPromoRules();
    } catch (e: any) {
      setStayPromoErr(e?.error ?? e?.message ?? "Erreur");
    } finally {
      setStayPromoSaving(false);
    }
  }, [loadStayPromoRules, resetStayPromoForm, spActive, spLabel, spMinNights, spPromoPct, spValidFrom, spValidTo, stayPromoEditId]);

  const deleteStayPromo = React.useCallback(
    async (id: string) => {
      if (!window.confirm("Supprimer cette promotion ?")) return;
      setStayPromoErr(null);
      try {
        await api.adminDeleteStayPromoRule(id);
        if (stayPromoEditId === id) resetStayPromoForm();
        await loadStayPromoRules();
      } catch (e: any) {
        setStayPromoErr(e?.error ?? "Erreur");
      }
    },
    [loadStayPromoRules, resetStayPromoForm, stayPromoEditId]
  );

  const patchStayPromoActive = React.useCallback(
    async (id: string, active: boolean) => {
      setStayPromoErr(null);
      try {
        await api.adminUpdateStayPromoRule(id, { active });
        await loadStayPromoRules();
      } catch (e: any) {
        setStayPromoErr(e?.error ?? "Erreur");
      }
    },
    [loadStayPromoRules]
  );

  const reload = React.useCallback(async () => {
    const [c, b] = await Promise.all([
      visibleRange ? api.publicCalendar(visibleRange.from, visibleRange.to) : api.publicCalendar(),
      api.adminBookings()
    ]);
    setCal(c);
    setBookings(b as any[]);
  }, [visibleRange]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = () => setWide(mql.matches);
    onChange();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Safari fallback
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(onChange);
  }, []);

  const periodSortedYmd = React.useMemo(() => sortNightYmd(periodSelectedYmd), [periodSelectedYmd]);
  const periodSortedYmdSet = React.useMemo(() => new Set(periodSortedYmd), [periodSortedYmd]);
  const contiguousPeriodChunks = React.useMemo(() => chunksContiguousWallDays(periodSortedYmd), [periodSortedYmd]);

  const events = React.useMemo(() => {
    const bookingEvents = (bookings ?? []).map((b: any) => ({
      id: `b:${b.id}`,
      start: b.startDate,
      end: b.endDate,
      display: "background" as const,
      backgroundColor: b.status === "CONFIRMED" ? "#c1121f" : "#f7b801"
    }));
    const blockEvents = (cal?.blocks ?? []).map((blk: any, i: number) => ({
      id: `blk:${blk.startDate}:${blk.endDate}:${i}`,
      start: blk.startDate,
      end: blk.endDate,
      display: "background" as const,
      backgroundColor: "rgba(225, 29, 72, 0.35)",
      classNames: ["sdg-block-bg"]
    }));
    return [...bookingEvents, ...blockEvents];
  }, [cal, bookings]);

  const configByDay = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const dc of cal?.dayConfigs ?? []) {
      const utcKey = dbNightYmd(dc.date);
      const locKey = localDayKey(new Date(dc.date));
      map.set(utcKey, dc);
      if (locKey !== utcKey) map.set(locKey, dc);
    }
    return map;
  }, [cal]);

  const bookingLabelByDay = React.useMemo(() => {
    // Same active statuses as bookingStatusByDay — CANCELLED must free dates for reservation
    const map = new Map<string, string>();
    for (const b of bookings ?? []) {
      if (b.status !== "CONFIRMED" && b.status !== "PENDING") continue;
      const start = new Date(b.startDate);
      const end = new Date(b.endDate); // exclusive in our API semantics
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
      const label = b?.user?.profileName || b?.user?.email || "Réservé";
      for (let d = new Date(start); d < end; d = addDaysLocal(d, 1)) {
        const key = localDayKey(d);
        // keep confirmed over pending if both exist
        const existing = map.get(key);
        if (!existing) map.set(key, label);
        if (b.status === "CONFIRMED") map.set(key, label);
      }
    }
    return map;
  }, [bookings]);

  const bookingIdByDay = React.useMemo(() => {
    const map = new Map<string, string>();
    const rank = new Map<string, string>();
    for (const b of bookings ?? []) {
      if (b.status !== "CONFIRMED" && b.status !== "PENDING" || !b.id) continue;
      const start = new Date(b.startDate);
      const end = new Date(b.endDate);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
      for (let d = new Date(start); d < end; d = addDaysLocal(d, 1)) {
        const key = localDayKey(d);
        const current = rank.get(key);
        if (!current || b.status === "CONFIRMED") {
          map.set(key, b.id);
          rank.set(key, b.status);
        }
      }
    }
    return map;
  }, [bookings]);

  const bookingStatusByDay = React.useMemo(() => {
    const map = new Map<string, "CONFIRMED" | "PENDING">();
    for (const b of bookings ?? []) {
      if (b.status !== "CONFIRMED" && b.status !== "PENDING") continue;
      const start = new Date(b.startDate);
      const end = new Date(b.endDate);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
      for (let d = new Date(start); d < end; d = addDaysLocal(d, 1)) {
        const key = localDayKey(d);
        const existing = map.get(key);
        if (!existing) map.set(key, b.status);
        if (b.status === "CONFIRMED") map.set(key, "CONFIRMED");
      }
    }
    return map;
  }, [bookings]);

  const blockedByDay = React.useMemo(() => {
    const map = new Map<string, boolean>();
    for (const blk of cal?.blocks ?? []) {
      const start = new Date(blk.startDate);
      const end = new Date(blk.endDate);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
      for (let d = new Date(start); d < end; d = addDaysLocal(d, 1)) {
        map.set(localDayKey(d), true);
      }
    }
    return map;
  }, [cal]);

  const loadDayFromDb = React.useCallback(
    async (dayKey: string) => {
      setDayLoading(true);
      setError(null);
      try {
        const start = new Date(`${dayKey}T00:00:00.000Z`);
        const end = addDaysLocal(start, 1);
        const c = await api.publicCalendar(start.toISOString(), end.toISOString());

        const dc = (c as any)?.dayConfigs?.find((x: any) => dbNightYmd(x.date) === dayKey);
        if (dc) {
          setPrice(((dc.priceCents ?? 0) / 100).toString());
          setArrivalAllowed(dc.arrivalAllowed ?? true);
          setDepartureAllowed(dc.departureAllowed ?? true);
          setPromoPercent(dc.promoPercent != null ? String(dc.promoPercent) : "");
          setPromoLabel(dc.promoLabel ?? "");
        } else {
          // No config in DB for this day
          setPrice("80");
          setArrivalAllowed(true);
          setDepartureAllowed(true);
          setPromoPercent("");
          setPromoLabel("");
        }

        const blocked = Boolean((c as any)?.blocks?.find((blk: any) => new Date(blk.startDate) < end && new Date(blk.endDate) > start));
        setDayBlocked(blocked);

        // Booking label comes from adminBookings (richer than publicCalendar)
        setDayWho(bookingLabelByDay.get(dayKey) ?? null);
      } catch (e: any) {
        setError(e?.error ?? e?.message ?? "Erreur");
      } finally {
        setDayLoading(false);
      }
    },
    [bookingLabelByDay]
  );

  const openDayModal = React.useCallback(
    (dayKey: string) => {
      setError(null);
      setDayModalKey(dayKey);
      void loadDayFromDb(dayKey);
    },
    [loadDayFromDb]
  );

  const saveDayModal = async () => {
    if (!dayModalKey) return;
    setError(null);
    try {
      const priceCents = Math.round(Number(price) * 100);
      if (!Number.isFinite(priceCents) || priceCents < 0) throw new Error("INVALID_PRICE");
      await api.adminUpsertDayConfig({
        from: dayModalKey,
        to: dayModalKey,
        priceCents,
        arrivalAllowed,
        departureAllowed,
        promoPercent: promoPercent ? Number(promoPercent) : null,
        promoLabel: promoLabel || null
      });
      await reload();
      await loadDayFromDb(dayModalKey);
    } catch (e: any) {
      setError(e?.error ?? e?.message ?? "Erreur");
    }
  };

  const toggleDayBlock = async () => {
    if (!dayModalKey) return;
    if (!dayBlocked && bookingCoveringDay(bookings, dayModalKey)) {
      setError("Ce jour a une réservation demandée ou confirmée. Passe par les réservations pour le libérer.");
      return;
    }
    setError(null);
    try {
      const startDate = `${dayModalKey}T00:00:00.000Z`;
      const endDate = addDaysLocal(new Date(startDate), 1).toISOString();
      if (dayBlocked) {
        // Only unblock this specific day (split existing blocks if needed)
        await api.adminUnblockDay(dayModalKey);
      } else {
        await api.adminCreateBlock({ startDate, endDate, reason: blockReason || undefined });
      }
      await reload();
      await loadDayFromDb(dayModalKey);
    } catch (e: any) {
      setError(e?.error ?? e?.message ?? "Erreur");
    }
  };

  const onAdminDragSelect = (arg: DateSelectArg) => {
    const api = calRef.current?.getApi();
    setError(null);
    try {
      if (!arg.allDay || !arg.startStr || !arg.endStr) return;
      suppressDateClickUntilRef.current = Date.now() + 200;
      const nights = eachNightBetweenWall(arg.startStr, arg.endStr);
      if (nights.length === 0) return;
      setPeriodSelectedYmd((prev) => {
        const s = new Set(prev.map((p) => p.slice(0, 10)));
        for (const y of nights) s.add(y);
        return sortNightYmd(s);
      });
    } catch {
      setError("Sélection calendrier invalide. Réessaie après avoir rafraîchi la page.");
    } finally {
      try {
        api?.unselect();
      } catch {
        /* FullCalendar peut jeter pendant un teardown / HMR */
      }
    }
  };

  const onPeriodDayToggle = (arg: DateClickArg) => {
    const api = calRef.current?.getApi();
    if (Date.now() < suppressDateClickUntilRef.current) {
      try {
        api?.unselect();
      } catch {
        /* noop */
      }
      return;
    }
    const clicked = arg.jsEvent?.target;
    if (clicked instanceof Element && clicked.closest("button")) return;
    setError(null);
    try {
      const raw = arg.dateStr ?? localDayKey(arg.date);
      const ymd = raw.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
      setPeriodSelectedYmd((prev) => {
        const s = new Set(prev.map((p) => p.slice(0, 10)));
        if (s.has(ymd)) s.delete(ymd);
        else s.add(ymd);
        return sortNightYmd(s);
      });
    } catch {
      setError("Clic calendrier invalide.");
    } finally {
      try {
        api?.unselect();
      } catch {
        /* noop */
      }
    }
  };

  const createBlock = async () => {
    if (!contiguousPeriodChunks.length) return;
    setError(null);
    try {
      const reasonOrUndef = blockReason || undefined;
      for (const chunk of contiguousPeriodChunks) {
        const startDate = `${chunk[0]!}T00:00:00.000Z`;
        const endDate = `${addWallDaysYmd(chunk[chunk.length - 1]!, 1)}T00:00:00.000Z`;
        await api.adminCreateBlock({ startDate, endDate, reason: reasonOrUndef });
      }
      setPeriodSelectedYmd([]);
      setBlockReason("");
      await reload();
    } catch (e: any) {
      setError(e?.error ?? "Erreur");
    }
  };

  const clearBlocks = async () => {
    if (!contiguousPeriodChunks.length) return;
    setError(null);
    try {
      for (const chunk of contiguousPeriodChunks) {
        const startDate = `${chunk[0]!}T00:00:00.000Z`;
        const endDate = `${addWallDaysYmd(chunk[chunk.length - 1]!, 1)}T00:00:00.000Z`;
        await api.adminClearBlocks({ startDate, endDate });
      }
      setPeriodSelectedYmd([]);
      setBlockReason("");
      await reload();
    } catch (e: any) {
      setError(e?.error ?? "Erreur");
    }
  };

  const savePricing = async () => {
    if (!contiguousPeriodChunks.length) return;
    setError(null);
    try {
      const priceCents = Math.round(Number(price) * 100);
      if (!Number.isFinite(priceCents) || priceCents < 0) throw new Error("INVALID_PRICE");

      for (const chunk of contiguousPeriodChunks) {
        const from = chunk[0]!;
        const to = chunk[chunk.length - 1]!;
        await api.adminUpsertDayConfig({
          from,
          to,
          priceCents,
          arrivalAllowed,
          departureAllowed,
          promoPercent: promoPercent ? Number(promoPercent) : null,
          promoLabel: promoLabel || null
        });
      }
      await reload();
    } catch (e: any) {
      setError(e?.error ?? e?.message ?? "Erreur");
    }
  };

  const isBlockedSelection = React.useMemo(() => {
    if (!contiguousPeriodChunks.length || !cal) return false;
    return contiguousPeriodChunks.some((chunk) => {
      const start = new Date(`${chunk[0]!}T00:00:00.000Z`);
      const end = new Date(`${addWallDaysYmd(chunk[chunk.length - 1]!, 1)}T00:00:00.000Z`);
      return isoRangeTouchesBlock(start, end, cal.blocks ?? []);
    });
  }, [contiguousPeriodChunks, cal]);

  const setStatus = async (id: string, status: "PENDING" | "CONFIRMED" | "CANCELLED") => {
    setError(null);
    try {
      await api.adminSetBookingStatus(id, status);
      await reload();
    } catch (e: any) {
      setError(e?.error ?? "Erreur");
    }
  };

  const openAddBooking = () => {
    const nights = sortNightYmd(periodSelectedYmd);
    const start = nights[0] ?? "";
    const end = nights.length ? addWallDaysYmd(nights[nights.length - 1]!, 1) : "";
    setAddError(null);
    setPlatformFile(null);
    setPlatformPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAddForm({ start, end, mode: "existing", clientId: "", query: "", firstName: "", lastName: "", email: "", phone: "", residenceAddress: "", platformEnabled: false, platform: DEFAULT_BOOKING_PLATFORM, notes: "" });
    setAddOpen(true);
    void api.adminClients().then(setClients).catch(() => setClients([]));
  };

  const visibleClients = React.useMemo(() => {
    const q = addForm.query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => {
      const blob = `${clientLabel(client)} ${client.email} ${client.phone ?? ""} ${client.residenceAddress ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [addForm.query, clients]);

  const submitAddBooking = async () => {
    if (!addForm.start || !addForm.end || addForm.end <= addForm.start) {
      setAddError("Le départ doit être après l’arrivée.");
      return;
    }
    if (addForm.mode === "existing" && !addForm.clientId) {
      setAddError("Choisis un client.");
      return;
    }
    if (addForm.mode === "new" && (!addForm.firstName.trim() || !addForm.lastName.trim() || !addForm.email.trim() || addForm.phone.trim().length < 6)) {
      setAddError("Prénom, nom, email et téléphone sont requis pour un nouveau client.");
      return;
    }
    if (addForm.platformEnabled && platformFile) {
      const type = platformFile.type;
      if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") {
        setAddError("L’image doit être un JPEG, un PNG ou un WebP.");
        return;
      }
      if (platformFile.size > 8_000_000) {
        setAddError("L’image dépasse 8 Mo.");
        return;
      }
    }
    setAddSaving(true);
    setAddError(null);
    try {
      const notes = addForm.notes.trim();
      const result = await api.adminCreateBooking({
        startDate: addForm.start,
        endDate: addForm.end,
        ...(notes ? { notes } : {}),
        ...(addForm.platformEnabled ? { platform: addForm.platform } : {}),
        ...(addForm.mode === "existing"
          ? {
              clientId: addForm.clientId,
              firstName: addForm.firstName.trim(),
              lastName: addForm.lastName.trim(),
              residenceAddress: addForm.residenceAddress.trim()
            }
          : {
              client: {
                firstName: addForm.firstName.trim(),
                lastName: addForm.lastName.trim(),
                email: addForm.email.trim(),
                phone: addForm.phone.trim()
              },
              ...(addForm.residenceAddress.trim() ? { residenceAddress: addForm.residenceAddress.trim() } : {})
            })
      });
      if (addForm.platformEnabled && platformFile) {
        try {
          await api.adminUploadBookingPlatformImage(result.booking.id, platformFile);
        } catch (imageError: any) {
          setAddOpen(false);
          setAddNotice("Réservation ajoutée, mais l’image n’a pas été enregistrée.");
          setError(addBookingError(String(imageError?.error ?? "")));
          await reload();
          return;
        }
      }
      setAddOpen(false);
      setAddNotice(result.clientCreated ? "Client créé et réservation ajoutée." : "Réservation ajoutée.");
      await reload();
    } catch (e: any) {
      setAddError(addBookingError(String(e?.error ?? "")));
    } finally {
      setAddSaving(false);
    }
  };

  const deleteBooking = async (id: string, status: string) => {
    const label = status === "PENDING" ? "cette demande de réservation" : "cette réservation";
    if (!window.confirm(`Supprimer définitivement ${label} ? Le message de demande lié sera aussi effacé.`)) return;
    setError(null);
    try {
      await api.adminDeleteBooking(id);
      if (bookingModalId === id) setBookingModalId(null);
      setProposal((prev) => (prev?.id === id ? null : prev));
      await reload();
    } catch (e: any) {
      setError(e?.error ?? "Erreur");
    }
  };

  const sendBookingMail = async (id: string) => {
    setError(null);
    setMailSendingId(id);
    setMailStatusById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const res = await api.adminSendBookingEmail(id);
      setMailStatusById((prev) => ({ ...prev, [id]: `Mail envoyé à ${res.to}` }));
    } catch (e: any) {
      const code = e?.error ?? "Erreur";
      const msg =
        code === "MAIL_DISABLED"
          ? "SMTP non configuré"
          : code === "NO_GUEST_EMAIL"
            ? "Pas d’email client"
            : code === "MAIL_SEND_FAILED"
              ? "Échec d’envoi"
              : String(code);
      setMailStatusById((prev) => ({ ...prev, [id]: msg }));
      setError(`Mail: ${msg}`);
    } finally {
      setMailSendingId(null);
    }
  };

  const openProposal = (b: { id: string; startDate: string; endDate: string; user?: { profileName?: string | null; email?: string | null } | null }) => {
    const start = dbNightYmd(b.startDate);
    const end = dbNightYmd(b.endDate);
    setProposalError(null);
    setProposal({
      id: b.id,
      guest: b.user?.profileName?.trim() || b.user?.email || "Client",
      requestedLabel: `${new Date(b.startDate).toLocaleDateString("fr-FR")} → ${new Date(b.endDate).toLocaleDateString("fr-FR")}`,
      proposedStart: start,
      proposedEnd: end,
      message: ""
    });
  };

  const sendProposal = async () => {
    if (!proposal) return;
    const message = proposal.message.trim();
    if (!message) {
      setProposalError("Écris le message de la contre-proposition.");
      return;
    }
    if (proposal.proposedEnd <= proposal.proposedStart) {
      setProposalError("La date de départ doit être après l’arrivée.");
      return;
    }
    setProposalSending(true);
    setProposalError(null);
    try {
      const res = await api.adminProposeBooking(proposal.id, {
        proposedStart: proposal.proposedStart,
        proposedEnd: proposal.proposedEnd,
        message
      });
      setMailStatusById((prev) => ({ ...prev, [proposal.id]: `Contre-proposition envoyée à ${res.to}` }));
      setProposal(null);
    } catch (e: any) {
      const code = e?.error ?? "Erreur";
      const msg =
        code === "MAIL_DISABLED"
          ? "SMTP non configuré"
          : code === "NO_GUEST_EMAIL"
            ? "Pas d’email client"
            : code === "NOT_A_REQUEST"
              ? "La contre-proposition concerne une demande en attente."
              : code === "MAIL_SEND_FAILED"
                ? "Échec d’envoi"
                : String(code);
      setProposalError(msg);
    } finally {
      setProposalSending(false);
    }
  };

  const openEditBooking = async (id: string) => {
    setEditError(null);
    setEditFile(null);
    setEditPreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
    setEditOpen(true);
    setEditLoading(true);
    try {
      const data = (await api.adminBookingDetail(id)) as {
        booking: {
          startDate: string;
          endDate: string;
          notes?: string | null;
          platform?: string | null;
          platformImageType?: string | null;
          user?: {
            firstName?: string | null;
            lastName?: string | null;
            profileName?: string | null;
            email?: string | null;
            phone?: string | null;
            residenceAddress?: string | null;
          } | null;
        };
      };
      const names = clientNameParts(data.booking.user ?? {});
      const platform = data.booking.platform?.trim() || "";
      setEditForm({
        id,
        start: dbNightYmd(data.booking.startDate),
        end: dbNightYmd(data.booking.endDate),
        firstName: names.firstName,
        lastName: names.lastName,
        email: data.booking.user?.email ?? "",
        phone: data.booking.user?.phone ?? "",
        residenceAddress: data.booking.user?.residenceAddress ?? "",
        platformEnabled: Boolean(platform),
        platform: platform || DEFAULT_BOOKING_PLATFORM,
        notes: data.booking.notes ?? "",
        hasImage: Boolean(data.booking.platformImageType)
      });
      if (data.booking.platformImageType) setEditPreview(`/api/admin/bookings/${id}/platform-image`);
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "";
      setEditError(addBookingError(code));
      setEditOpen(false);
    } finally {
      setEditLoading(false);
    }
  };

  const submitEditBooking = async () => {
    if (!editForm.start || !editForm.end || editForm.end <= editForm.start) {
      setEditError("Le départ doit être après l’arrivée.");
      return;
    }
    if (editForm.platformEnabled && editFile) {
      if (editFile.type !== "image/jpeg" && editFile.type !== "image/png" && editFile.type !== "image/webp") {
        setEditError("L’image doit être un JPEG, un PNG ou un WebP.");
        return;
      }
      if (editFile.size > 8_000_000) {
        setEditError("L’image dépasse 8 Mo.");
        return;
      }
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await api.adminUpdateBooking(editForm.id, {
        startDate: editForm.start,
        endDate: editForm.end,
        notes: editForm.notes.trim(),
        platform: editForm.platformEnabled ? editForm.platform : null,
        residenceAddress: editForm.residenceAddress.trim(),
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        phone: editForm.phone.trim()
      });
      if (editForm.platformEnabled && editFile) {
        await api.adminUploadBookingPlatformImage(editForm.id, editFile);
      }
      setEditOpen(false);
      await reload();
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "";
      setEditError(addBookingError(code));
    } finally {
      setEditSaving(false);
    }
  };

  const openBookingModal = async (id: string) => {
    setError(null);
    setBookingModalId(id);
    setBookingLoading(true);
    setBookingModalData(null);
    try {
      const data = await api.adminBookingDetail(id);
      setBookingModalData(data);
    } catch (e: any) {
      setError(e?.error ?? e?.message ?? "Erreur");
      setBookingModalId(null);
    } finally {
      setBookingLoading(false);
    }
  };

  const filteredBookings = React.useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    const statusLabel = (s: string) => {
      if (s === "CONFIRMED") return "confirmé confirme confirmed";
      if (s === "PENDING") return "en attente pending attente";
      if (s === "CANCELLED") return "annulé annule cancelled canceled";
      return s;
    };
    const haystack = (b: any) => {
      const start = new Date(b.startDate);
      const end = new Date(b.endDate);
      const parts = [
        b.id,
        b.status,
        statusLabel(String(b.status ?? "")),
        b.user?.profileName,
        b.user?.email,
        b.user?.phone,
        b.notes,
        b.equipment,
        Number.isFinite(start.getTime()) ? start.toLocaleDateString("fr-FR") : "",
        Number.isFinite(end.getTime()) ? end.toLocaleDateString("fr-FR") : "",
        Number.isFinite(start.getTime()) ? start.toISOString().slice(0, 10) : "",
        Number.isFinite(end.getTime()) ? end.toISOString().slice(0, 10) : ""
      ];
      return parts.filter(Boolean).join(" ").toLowerCase();
    };
    let rows = [...(bookings ?? [])];
    if (bookingStatusFilter !== "ALL") {
      rows = rows.filter((b) => b.status === bookingStatusFilter);
    }
    if (q) {
      rows = rows.filter((b) => haystack(b).includes(q));
    }
    const rank = (s: string) => (s === "PENDING" ? 0 : s === "CONFIRMED" ? 1 : 2);
    rows.sort((a, b) => {
      if (bookingStatusFilter === "ALL") {
        const dr = rank(String(a.status)) - rank(String(b.status));
        if (dr !== 0) return dr;
      }
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    });
    return rows;
  }, [bookingSearch, bookingStatusFilter, bookings]);

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Admin — Calendrier</h1>
      <p className="sdg-subtitle mt-2">Bloque des périodes, confirme/annule les demandes.</p>

      <div className="sdg-card mt-6 p-4 md:p-5">
        <div className="text-sm font-extrabold tracking-tight text-slate-900">Promotions séjour</div>
        <p className="mt-1 text-sm text-slate-600">
          Réduction en % sur le total après les promos journalières, si toutes les nuits du séjour sont dans la période indiquée (dernière nuit incluse) et que la
          durée en nuits est au moins le minimum fixé.
        </p>
        {stayPromoErr ? <div className="mt-2 text-sm font-semibold text-rose-700">{stayPromoErr}</div> : null}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <label className="sdg-label">Période du (1re nuit)</label>
            <DateField className="sdg-input" value={spValidFrom} onChange={setSpValidFrom} />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Au (dernière nuit incluse)</label>
            <DateField className="sdg-input" value={spValidTo} onChange={setSpValidTo} />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Nuits min.</label>
            <input className="sdg-input" value={spMinNights} onChange={(e) => setSpMinNights(e.target.value)} inputMode="numeric" />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Réduction %</label>
            <input className="sdg-input" value={spPromoPct} onChange={(e) => setSpPromoPct(e.target.value)} inputMode="numeric" />
          </div>
          <div className="md:col-span-8">
            <label className="sdg-label">Libellé (optionnel)</label>
            <input className="sdg-input" value={spLabel} onChange={(e) => setSpLabel(e.target.value)} placeholder="Ex. Été curistes — long séjour" />
          </div>
          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 p-3 md:col-span-4 md:self-end">
            <input className="mt-1 h-4 w-4 accent-water-600" type="checkbox" checked={spActive} onChange={(e) => setSpActive(e.target.checked)} />
            <span className="text-sm font-semibold text-slate-800">Règle active</span>
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-12">
            <button type="button" className="sdg-btn-primary disabled:opacity-50" disabled={stayPromoSaving} onClick={() => void upsertStayPromo()}>
              {stayPromoEditId ? "Mettre à jour la règle" : "Créer une règle"}
            </button>
            {stayPromoEditId ? (
              <button type="button" className="sdg-btn-soft" disabled={stayPromoSaving} onClick={resetStayPromoForm}>
                Annuler la modification
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div className="max-h-[280px] overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-white/90 backdrop-blur">
                <tr className="border-b border-slate-200/70">
                  <th className="px-3 py-2 font-extrabold text-slate-700">Actif</th>
                  <th className="px-3 py-2 font-extrabold text-slate-700">Du</th>
                  <th className="px-3 py-2 font-extrabold text-slate-700">Au (inclus)</th>
                  <th className="px-3 py-2 font-extrabold text-slate-700">Min. nuits</th>
                  <th className="px-3 py-2 font-extrabold text-slate-700">%</th>
                  <th className="px-3 py-2 font-extrabold text-slate-700">Libellé</th>
                  <th className="px-3 py-2 font-extrabold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stayPromoRules.map((r) => (
                  <tr key={r.id} className="border-b border-slate-200/60 last:border-b-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-water-600"
                        checked={Boolean(r.active)}
                        onChange={(e) => void patchStayPromoActive(r.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{new Date(r.validFrom).toLocaleDateString("fr-FR")}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{new Date(r.validToInclusive).toLocaleDateString("fr-FR")}</td>
                    <td className="px-3 py-2 text-slate-800">{r.minStayNights}</td>
                    <td className="px-3 py-2 font-extrabold text-slate-900">{r.promoPercent}%</td>
                    <td className="px-3 py-2 text-slate-700">{r.label ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className="sdg-btn-soft !px-2 !py-1 text-[12px]" onClick={() => startEditStayPromo(r)}>
                          Modifier
                        </button>
                        <button type="button" className="sdg-btn-danger !px-2 !py-1 text-[12px]" onClick={() => void deleteStayPromo(r.id)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {stayPromoRules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-600">
                      Aucune promotion séjour. Créez-en une ci-dessus (ex. 01/07 → 31/08, 21 nuits min., 10 %).
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="sdg-card mt-6 p-3 md:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            Clic : ajouter / retirer un jour · Clic sur un nom : modifier la réservation · Glisser (clic maintenu) : ajouter toute la plage à la sélection · Double-clic : détail du jour.
          </div>
        </div>
        <div className="text-sm text-slate-600">
          Prix / promo / arrivée-départ : un enregistrement par groupe de jours consécutifs. Blocage / déblocage : même principe.
        </div>
        <div className="mt-3">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, interactionPlugin, multiMonthPlugin]}
            initialView={wide ? "multiMonthTwoMonth" : "dayGridMonth"}
            views={{
              multiMonthTwoMonth: { type: "multiMonth", duration: { months: 2 } }
            }}
            multiMonthMaxColumns={wide ? 2 : 1}
            multiMonthMinWidth={320}
            locale="fr"
            headerToolbar={{
              start: "title",
              center: "",
              end: "prev next"
            }}
            height="auto"
            fixedWeekCount
            showNonCurrentDates={false}
            selectable
            selectMirror
            selectAllow={(span) => span != null && Boolean((span as { allDay?: boolean }).allDay)}
            select={onAdminDragSelect}
            dateClick={onPeriodDayToggle}
            datesSet={(arg) => {
              // Keep API data aligned with currently visible calendar range
              setVisibleRange({ from: arg.start.toISOString(), to: arg.end.toISOString() });
            }}
            events={events as any}
            eventDidMount={(info) => {
              // Ensure styling hooks are present even if FullCalendar ignores classNames on background events
              if (typeof info.event.id === "string" && info.event.id.startsWith("blk:")) {
                info.el.classList.add("sdg-block-bg");
              }
            }}
            dayCellClassNames={(arg) => {
              const cellYmd = fcCellYmd(arg);
              const classes: string[] = [];
              const status = bookingStatusByDay.get(cellYmd);
              if (status === "CONFIRMED") classes.push("sdg-booked-day");
              if (status === "PENDING") classes.push("sdg-booked-day-pending");
              if (blockedByDay.get(cellYmd)) classes.push("sdg-blocked-day");
              if (periodSortedYmdSet.has(cellYmd)) classes.push("sdg-cal-picked-day");
              return classes;
            }}
            dayCellDidMount={(arg) => {
              type ElAug = HTMLElement & { [ADMIN_DAY_DBLCLICK_KEY]?: EventListener };
              const el = arg.el as ElAug | undefined | null;
              if (!el) return;
              const cellYmd = fcCellYmd(arg);
              const handler: EventListener = (e: Event) => {
                const ev = e as MouseEvent;
                ev.preventDefault();
                ev.stopPropagation();
                openDayModal(cellYmd);
              };
              el[ADMIN_DAY_DBLCLICK_KEY] = handler;
              el.addEventListener("dblclick", handler);
            }}
            dayCellWillUnmount={(arg) => {
              type ElAug = HTMLElement & { [ADMIN_DAY_DBLCLICK_KEY]?: EventListener };
              const el = arg.el as ElAug | undefined | null;
              if (!el) return;
              const h = el[ADMIN_DAY_DBLCLICK_KEY];
              if (h) {
                el.removeEventListener("dblclick", h);
                delete el[ADMIN_DAY_DBLCLICK_KEY];
              }
            }}
            dayCellContent={(arg) => {
              const cellYmd = fcCellYmd(arg);
              const dc = configByDay.get(cellYmd);
              const priceCents: number | undefined = dc?.priceCents;
              const promoPercent: number | null | undefined = dc?.promoPercent;
              const promoLabel: string | null | undefined = dc?.promoLabel;
              const arrivalAllowed = dc?.arrivalAllowed ?? true;
              const departureAllowed = dc?.departureAllowed ?? true;
              const who = bookingLabelByDay.get(cellYmd);

              return (
                <div className="flex min-h-[44px] flex-col items-end gap-0.5">
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="text-xs font-extrabold text-slate-900">{arg.dayNumberText}</div>
                    <div className="flex items-center gap-1">
                      {!arrivalAllowed ? <NoEntryIcon title="Arrivée interdite" className="text-sky-700" /> : null}
                      {!departureAllowed ? <NoEntryIcon title="Départ interdit" className="text-rose-700" /> : null}
                    </div>
                  </div>

                  {typeof priceCents === "number" ? (
                    <div className="rounded-md bg-sun-100 px-1.5 py-0.5 text-[11px] font-extrabold text-slate-900">
                      {(priceCents / 100).toFixed(0)}€
                    </div>
                  ) : null}

                  {typeof promoPercent === "number" && promoPercent > 0 ? (
                    <div className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-extrabold text-emerald-900">
                      -{promoPercent}%{promoLabel ? ` ${promoLabel}` : ""}
                    </div>
                  ) : null}

                  {who ? (
                    <ClientDayName
                      label={who}
                      onOpen={() => {
                        const id = bookingIdByDay.get(cellYmd);
                        if (id) void openEditBooking(id);
                      }}
                    />
                  ) : null}
                </div>
              );
            }}
          />
        </div>
      </div>

      {periodSortedYmd.length > 0 && (
        <div className="sdg-card mt-4 p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div>
              <div className="text-sm font-extrabold tracking-tight text-slate-900">Paramètres de la période</div>
              <div className="mt-1 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{periodSortedYmd.length}</span> jour
                {periodSortedYmd.length > 1 ? "s " : " "}
                sélectionné{periodSortedYmd.length > 1 ? "s" : ""} :{" "}
                <span className="font-mono">
                  {periodSortedYmd.length <= 14
                    ? periodSortedYmd.join(", ")
                    : `${periodSortedYmd.slice(0, 12).join(", ")}… (+${periodSortedYmd.length - 12})`}
                </span>
              </div>
              <div className="mt-2 text-sm text-slate-600">
                {contiguousPeriodChunks.length === 1 && contiguousPeriodChunks[0]?.length ? (
                  (() => {
                    const chunk = contiguousPeriodChunks[0]!;
                    const fromYmd = chunk[0]!;
                    const toYmd = chunk[chunk.length - 1]!;
                    const nights = countInclusiveWallDays(fromYmd, toYmd);
                    return (
                      <>
                        Plage continue : du <span className="font-semibold text-slate-800">{fromYmd}</span> au{" "}
                        <span className="font-semibold text-slate-800">{toYmd}</span> inclus ({nights} jour{nights > 1 ? "s" : ""}).
                      </>
                    );
                  })()
                ) : contiguousPeriodChunks.length > 1 ? (
                  <>
                    Plusieurs groupes disjoints ({contiguousPeriodChunks.length}) — une requête API par groupe :
                    <ul className="mt-1 list-inside list-disc pl-1">
                      {contiguousPeriodChunks.map((chunk, idx) => {
                        const fromYmd = chunk[0]!;
                        const toYmd = chunk[chunk.length - 1]!;
                        const nights = countInclusiveWallDays(fromYmd, toYmd);
                        return (
                          <li key={`${fromYmd}-${toYmd}-${idx}`}>
                            Groupe {idx + 1} :{" "}
                            <span className="font-semibold text-slate-800">
                              {fromYmd}
                            </span>{" "}
                            →{" "}
                            <span className="font-semibold text-slate-800">{toYmd}</span> ({nights} jour{nights > 1 ? "s" : ""})
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <span className="text-slate-500">Répartition des groupes indisponible.</span>
                )}
              </div>
              <div className="mt-1 text-[12px] leading-snug text-slate-500">
                Chaque case est une date calendaire locale. Les traitements suivants s’appliquent à tous les groupes sélectionnés sans toucher aux jours situés entre deux groupes.
              </div>
            </div>
            <button
              type="button"
              className="sdg-btn-soft self-end sm:self-auto"
              onClick={() => {
                setPeriodSelectedYmd([]);
                setError(null);
              }}
            >
              Effacer la sélection
            </button>
          </div>

          <>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-3">
                <label className="sdg-label">Prix / nuit (€)</label>
                <input className="sdg-input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
              </div>
              <div className="md:col-span-3">
                <label className="sdg-label">Promo % (optionnel)</label>
                <input className="sdg-input" value={promoPercent} onChange={(e) => setPromoPercent(e.target.value)} inputMode="numeric" />
              </div>
              <div className="md:col-span-6">
                <label className="sdg-label">Libellé promo (optionnel)</label>
                <input className="sdg-input" value={promoLabel} onChange={(e) => setPromoLabel(e.target.value)} placeholder="Ex: -10% curistes" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 p-3">
                <input className="mt-1 h-4 w-4 accent-water-600" type="checkbox" checked={arrivalAllowed} onChange={(e) => setArrivalAllowed(e.target.checked)} />
                <span>
                  <span className="block text-sm font-extrabold text-slate-900">Arrivée autorisée</span>
                  <span className="block text-sm text-slate-600">Le client peut commencer sa réservation ce jour.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 p-3">
                <input className="mt-1 h-4 w-4 accent-water-600" type="checkbox" checked={departureAllowed} onChange={(e) => setDepartureAllowed(e.target.checked)} />
                <span>
                  <span className="block text-sm font-extrabold text-slate-900">Départ autorisé</span>
                  <span className="block text-sm text-slate-600">Le client peut terminer sa réservation ce jour.</span>
                </span>
              </label>
            </div>

            <div className="mt-4">
              <label className="sdg-label">Raison du blocage (optionnel)</label>
              <input className="sdg-input" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Ex: travaux, maintenance..." />
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button className="sdg-btn-primary" onClick={() => void savePricing()}>
                Enregistrer tarifs / règles
              </button>
              {!isBlockedSelection ? (
                <button className="sdg-btn-danger" onClick={() => void createBlock()}>
                  Bloquer la sélection
                </button>
              ) : (
                <button className="sdg-btn-soft" onClick={() => void clearBlocks()}>
                  Débloquer la sélection
                </button>
              )}
              <button
                type="button"
                className="sdg-btn-soft"
                onClick={() => {
                  setPeriodSelectedYmd([]);
                  setError(null);
                }}
              >
                Fermer
              </button>
            </div>
          </>
        </div>
      )}

      {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}

      {dayModalKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDayModalKey(null);
          }}
        >
          <div className="sdg-card max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-4 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div>
                <div className="text-base font-extrabold tracking-tight text-slate-900">Détails du jour</div>
                <div className="mt-1 text-sm text-slate-600">{dayModalKey}</div>
                {dayWho ? <DayClientCard booking={bookingCoveringDay(bookings, dayModalKey)} fallbackName={dayWho} /> : null}
                {dayLoading ? <div className="mt-1 text-sm font-semibold text-slate-700">Chargement…</div> : null}
              </div>
              <button className="sdg-btn-soft self-end sm:self-auto" onClick={() => setDayModalKey(null)}>
                Fermer
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-3">
                <label className="sdg-label">Prix / nuit (€)</label>
                <input className="sdg-input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
              </div>
              <div className="md:col-span-3">
                <label className="sdg-label">Promo %</label>
                <input className="sdg-input" value={promoPercent} onChange={(e) => setPromoPercent(e.target.value)} inputMode="numeric" />
              </div>
              <div className="md:col-span-6">
                <label className="sdg-label">Libellé promo</label>
                <input className="sdg-input" value={promoLabel} onChange={(e) => setPromoLabel(e.target.value)} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 p-3">
                <input className="mt-1 h-4 w-4 accent-water-600" type="checkbox" checked={arrivalAllowed} onChange={(e) => setArrivalAllowed(e.target.checked)} />
                <span>
                  <span className="block text-sm font-extrabold text-slate-900">Arrivée autorisée</span>
                  <span className="block text-sm text-slate-600">Le client peut commencer ce jour.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 p-3">
                <input className="mt-1 h-4 w-4 accent-water-600" type="checkbox" checked={departureAllowed} onChange={(e) => setDepartureAllowed(e.target.checked)} />
                <span>
                  <span className="block text-sm font-extrabold text-slate-900">Départ autorisé</span>
                  <span className="block text-sm text-slate-600">Le client peut terminer ce jour.</span>
                </span>
              </label>
            </div>

            <div className="mt-4">
              <label className="sdg-label">Blocage (optionnel)</label>
              {dayWho && !dayBlocked ? (
                <p className="text-sm font-semibold text-slate-700">
                  Ce jour a une réservation demandée ou confirmée. Le blocage n’est pas disponible ici : passe par les réservations.
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <input className="sdg-input sm:max-w-[420px]" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Raison (si blocage)" />
                  <button className={dayBlocked ? "sdg-btn-soft" : "sdg-btn-danger"} onClick={() => void toggleDayBlock()}>
                    {dayBlocked ? "Débloquer ce jour" : "Bloquer ce jour"}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="sdg-btn-soft" onClick={() => void loadDayFromDb(dayModalKey)}>
                Recharger depuis la base
              </button>
              <button className="sdg-btn-primary" onClick={() => void saveDayModal()}>
                Enregistrer
              </button>
              <button className="sdg-btn-soft" onClick={() => setDayModalKey(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sdg-card mt-6 overflow-hidden">
        <div className="border-b border-slate-200/70 bg-white/40 px-4 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-extrabold tracking-tight text-slate-900">Demandes / réservations</div>
                <div className="mt-0.5 text-xs text-slate-600">
                  {filteredBookings.length} résultat{filteredBookings.length > 1 ? "s" : ""}
                  {filteredBookings.length !== bookings.length ? ` sur ${bookings.length}` : ""}
                </div>
                {addNotice ? <div className="mt-1 text-xs font-semibold text-emerald-800">{addNotice}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2 self-start sm:self-auto">
                <button type="button" className="sdg-btn-primary !px-3 !py-1.5 text-xs" onClick={openAddBooking}>
                  Ajouter une réservation
                </button>
                {(bookingSearch || bookingStatusFilter !== "ALL") && (
                  <button
                    type="button"
                    className="sdg-btn-soft !px-3 !py-1.5 text-xs"
                    onClick={() => {
                      setBookingSearch("");
                      setBookingStatusFilter("ALL");
                    }}
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor="booking-search">
                  Rechercher une réservation
                </label>
                <input
                  id="booking-search"
                  className="sdg-input"
                  type="search"
                  value={bookingSearch}
                  onChange={(e) => setBookingSearch(e.target.value)}
                  placeholder="Rechercher : nom, email, téléphone, dates, statut, message…"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { key: "CONFIRMED" as const, label: "Confirmé" },
                    { key: "PENDING" as const, label: "En attente" },
                    { key: "CANCELLED" as const, label: "Annulé" }
                  ] as const
                ).map((opt) => {
                  const active = bookingStatusFilter === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={
                        active
                          ? opt.key === "CONFIRMED"
                            ? "sdg-btn-primary !px-3 !py-1.5 text-xs"
                            : opt.key === "PENDING"
                              ? "inline-flex items-center justify-center rounded-xl bg-sun-200 px-3 py-1.5 text-xs font-extrabold text-slate-900"
                              : "inline-flex items-center justify-center rounded-xl bg-slate-700 px-3 py-1.5 text-xs font-extrabold text-white"
                          : "sdg-btn-soft !px-3 !py-1.5 text-xs"
                      }
                      aria-pressed={active}
                      onClick={() => setBookingStatusFilter((prev) => (prev === opt.key ? "ALL" : opt.key))}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200/70 bg-white/30">
              <tr>
                <th className="px-4 py-3 font-extrabold text-slate-800">Client</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">Dates</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">Statut</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((b) => {
                const isConfirmed = b.status === "CONFIRMED";
                return (
                <tr
                  key={b.id}
                  className="cursor-pointer border-b border-slate-200/60 last:border-b-0 hover:bg-white/30"
                  onClick={() => void openEditBooking(b.id)}
                  title="Cliquer pour modifier"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{b.user?.profileName ?? b.user?.email}</div>
                    <div className="text-xs font-semibold text-slate-500">{b.user?.phone ?? ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    {new Date(b.startDate).toLocaleDateString("fr-FR")} → {new Date(b.endDate).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${
                        b.status === "CONFIRMED"
                          ? "bg-rose-600 text-white"
                          : b.status === "PENDING"
                            ? "bg-sun-200 text-slate-900"
                            : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        className="sdg-btn-primary disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={isConfirmed}
                        title={isConfirmed ? "Déjà confirmée" : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          void setStatus(b.id, "CONFIRMED");
                        }}
                      >
                        Confirmer
                      </button>
                      <button
                        type="button"
                        className="sdg-btn-soft disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={b.status !== "PENDING" || !b.user?.email}
                        title={
                          b.status !== "PENDING"
                            ? "Disponible pour une demande en attente"
                            : !b.user?.email
                              ? "Pas d’email client"
                              : "Envoyer une contre-proposition par e-mail"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          openProposal(b);
                        }}
                      >
                        Proposer
                      </button>
                      <button
                        type="button"
                        className="sdg-btn-soft disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={isConfirmed}
                        title={isConfirmed ? "Déjà confirmée" : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          void setStatus(b.id, "PENDING");
                        }}
                      >
                        En attente
                      </button>
                      <button
                        type="button"
                        className="sdg-btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          void setStatus(b.id, "CANCELLED");
                        }}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="sdg-btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteBooking(b.id, b.status);
                        }}
                      >
                        Supprimer
                      </button>
                      <button
                        type="button"
                        className="sdg-btn-soft disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={mailSendingId === b.id || !b.user?.email}
                        title={!b.user?.email ? "Pas d’email client" : "Envoyer un e-mail récapitulatif au client"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void sendBookingMail(b.id);
                        }}
                      >
                        {mailSendingId === b.id ? "Envoi…" : "Envoyer mail"}
                      </button>
                    </div>
                    {mailStatusById[b.id] ? (
                      <div className="mt-1 text-[12px] font-semibold text-slate-600">{mailStatusById[b.id]}</div>
                    ) : null}
                  </td>
                </tr>
                );
              })}
              {filteredBookings.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-600">
                    {bookings.length === 0
                      ? "Aucune réservation."
                      : "Aucun résultat pour cette recherche / ce filtre."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {proposal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sdg-proposal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !proposalSending) setProposal(null);
          }}
        >
          <div className="sdg-card w-full max-w-lg p-4 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div id="sdg-proposal-title" className="text-base font-extrabold tracking-tight text-slate-900">
                  Contre-proposition
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {proposal.guest} — demande du {proposal.requestedLabel}
                </p>
              </div>
              <button type="button" className="sdg-btn-soft" disabled={proposalSending} onClick={() => setProposal(null)}>
                Fermer
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="sdg-label" htmlFor="proposal-start">
                  Arrivée proposée
                </label>
                <DateField
                  id="proposal-start"
                  className="sdg-input"
                  value={proposal.proposedStart}
                  onChange={(ymd) => setProposal({ ...proposal, proposedStart: ymd })}
                />
              </div>
              <div>
                <label className="sdg-label" htmlFor="proposal-end">
                  Départ proposé
                </label>
                <DateField
                  id="proposal-end"
                  className="sdg-input"
                  value={proposal.proposedEnd}
                  onChange={(ymd) => setProposal({ ...proposal, proposedEnd: ymd })}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="sdg-label" htmlFor="proposal-message">
                Message au client
              </label>
              <textarea
                id="proposal-message"
                className="sdg-input min-h-28"
                value={proposal.message}
                onChange={(e) => setProposal({ ...proposal, message: e.target.value })}
                placeholder="Explique la proposition : autres dates, conditions, tarif…"
              />
            </div>
            {proposalError ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{proposalError}</div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button type="button" className="sdg-btn-primary disabled:opacity-50" disabled={proposalSending} onClick={() => void sendProposal()}>
                {proposalSending ? "Envoi…" : "Envoyer la proposition"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sdg-add-booking-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !addSaving) setAddOpen(false);
          }}
        >
          <div className="sdg-card max-h-[90dvh] w-full max-w-lg overflow-y-auto p-4 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div id="sdg-add-booking-title" className="text-base font-extrabold tracking-tight text-slate-900">
                  Ajouter une réservation
                </div>
                <p className="mt-1 text-sm text-slate-600">Sur le logement ouvert, avec un client déjà en base ou un nouveau client.</p>
              </div>
              <button type="button" className="sdg-btn-soft" disabled={addSaving} onClick={() => setAddOpen(false)}>
                Fermer
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="sdg-label" htmlFor="add-booking-start">
                  Arrivée
                </label>
                <DateField
                  id="add-booking-start"
                  className="sdg-input"
                  value={addForm.start}
                  onChange={(ymd) => setAddForm({ ...addForm, start: ymd })}
                />
              </div>
              <div>
                <label className="sdg-label" htmlFor="add-booking-end">
                  Départ
                </label>
                <DateField
                  id="add-booking-end"
                  className="sdg-input"
                  value={addForm.end}
                  onChange={(ymd) => setAddForm({ ...addForm, end: ymd })}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className={addForm.mode === "existing" ? "sdg-btn-primary !px-3 !py-1.5 text-xs" : "sdg-btn-soft !px-3 !py-1.5 text-xs"}
                onClick={() => {
                  const selected = clients.find((client) => client.id === addForm.clientId);
                  const names = selected ? clientNameParts(selected) : { firstName: "", lastName: "" };
                  setAddForm({
                    ...addForm,
                    mode: "existing",
                    firstName: names.firstName,
                    lastName: names.lastName,
                    residenceAddress: selected?.residenceAddress ?? ""
                  });
                }}
              >
                Client en base
              </button>
              <button
                type="button"
                className={addForm.mode === "new" ? "sdg-btn-primary !px-3 !py-1.5 text-xs" : "sdg-btn-soft !px-3 !py-1.5 text-xs"}
                onClick={() => setAddForm({ ...addForm, mode: "new", firstName: "", lastName: "", residenceAddress: "" })}
              >
                Nouveau client
              </button>
            </div>
            {addForm.mode === "existing" ? (
              <div className="mt-4">
                <label className="sdg-label" htmlFor="add-booking-client-search">
                  Rechercher un client
                </label>
                <input
                  id="add-booking-client-search"
                  className="sdg-input"
                  type="search"
                  value={addForm.query}
                  onChange={(e) => setAddForm({ ...addForm, query: e.target.value })}
                  placeholder="Prénom, nom, email ou téléphone"
                  autoComplete="off"
                />
                <div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-slate-200">
                  {visibleClients.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-slate-600">Aucun client ne correspond.</div>
                  ) : (
                    visibleClients.map((client) => {
                      const selected = client.id === addForm.clientId;
                      const name = clientLabel(client);
                      const names = clientNameParts(client);
                      return (
                        <button
                          key={client.id}
                          type="button"
                          className={`block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 ${
                            selected ? "bg-water-50" : "bg-white hover:bg-slate-50"
                          }`}
                          onClick={() =>
                            setAddForm({
                              ...addForm,
                              clientId: client.id,
                              firstName: names.firstName,
                              lastName: names.lastName,
                              residenceAddress: client.residenceAddress ?? ""
                            })
                          }
                        >
                          <div className="text-sm font-semibold text-slate-900">{name}</div>
                          <div className="text-xs text-slate-600">
                            {client.email}
                            {client.phone ? ` · ${client.phone}` : ""}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                {addForm.clientId ? (
                  <>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="sdg-label" htmlFor="add-booking-firstname">
                          Prénom
                        </label>
                        <input
                          id="add-booking-firstname"
                          className="sdg-input"
                          value={addForm.firstName}
                          onChange={(e) => setAddForm({ ...addForm, firstName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="sdg-label" htmlFor="add-booking-lastname">
                          Nom
                        </label>
                        <input
                          id="add-booking-lastname"
                          className="sdg-input"
                          value={addForm.lastName}
                          onChange={(e) => setAddForm({ ...addForm, lastName: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="sdg-label" htmlFor="add-booking-residence">
                        Adresse de résidence principale
                      </label>
                      <textarea
                        id="add-booking-residence"
                        className="sdg-input min-h-20"
                        value={addForm.residenceAddress}
                        onChange={(e) => setAddForm({ ...addForm, residenceAddress: e.target.value })}
                        placeholder="Numéro, rue, code postal, ville"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="sdg-label" htmlFor="add-booking-firstname-new">
                      Prénom
                    </label>
                    <input
                      id="add-booking-firstname-new"
                      className="sdg-input"
                      value={addForm.firstName}
                      onChange={(e) => setAddForm({ ...addForm, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="sdg-label" htmlFor="add-booking-lastname-new">
                      Nom
                    </label>
                    <input
                      id="add-booking-lastname-new"
                      className="sdg-input"
                      value={addForm.lastName}
                      onChange={(e) => setAddForm({ ...addForm, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="sdg-label" htmlFor="add-booking-email">
                    Email
                  </label>
                  <input
                    id="add-booking-email"
                    className="sdg-input"
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="sdg-label" htmlFor="add-booking-phone">
                    Téléphone
                  </label>
                  <input
                    id="add-booking-phone"
                    className="sdg-input"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="sdg-label" htmlFor="add-booking-residence-new">
                    Adresse de résidence principale
                  </label>
                  <textarea
                    id="add-booking-residence-new"
                    className="sdg-input min-h-20"
                    value={addForm.residenceAddress}
                    onChange={(e) => setAddForm({ ...addForm, residenceAddress: e.target.value })}
                    placeholder="Numéro, rue, code postal, ville"
                  />
                </div>
              </div>
            )}
            <div className="mt-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={addForm.platformEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    if (!enabled) {
                      setPlatformFile(null);
                      setPlatformPreview((current) => {
                        if (current) URL.revokeObjectURL(current);
                        return null;
                      });
                    }
                    setAddForm({
                      ...addForm,
                      platformEnabled: enabled,
                      platform: addForm.platform || DEFAULT_BOOKING_PLATFORM
                    });
                  }}
                  />
                  Plateforme
                </label>
                {addForm.platformEnabled ? (
                  <>
                    <select
                      id="add-booking-platform"
                      className="sdg-input mt-2"
                      aria-label="Plateforme de location"
                      value={addForm.platform}
                      onChange={(e) => setAddForm({ ...addForm, platform: e.target.value })}
                    >
                      <optgroup label="Principales">
                        {MAIN_BOOKING_PLATFORMS.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Autres">
                        {OTHER_BOOKING_PLATFORMS.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <label className="sdg-label mt-3" htmlFor="add-booking-platform-image">
                      Image liée à la réservation
                    </label>
                    <input
                      id="add-booking-platform-image"
                      className="mt-1 block w-full text-sm text-slate-700"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setPlatformFile(file);
                        setPlatformPreview((current) => {
                          if (current) URL.revokeObjectURL(current);
                          return file ? URL.createObjectURL(file) : null;
                        });
                      }}
                    />
                    {platformPreview ? (
                      <img src={platformPreview} alt="Aperçu de l’image" className="mt-2 max-h-40 rounded-xl border border-slate-200" />
                    ) : null}
                  </>
                ) : null}
            </div>
            <div className="mt-4">
              <label className="sdg-label" htmlFor="add-booking-notes">
                Message (optionnel)
              </label>
              <textarea
                id="add-booking-notes"
                className="sdg-input min-h-20"
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              />
            </div>
            {addError ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{addError}</div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button type="button" className="sdg-btn-primary disabled:opacity-50" disabled={addSaving} onClick={() => void submitAddBooking()}>
                {addSaving ? "Enregistrement…" : "Enregistrer la réservation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sdg-edit-booking-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editSaving) setEditOpen(false);
          }}
        >
          <div className="sdg-card max-h-[90dvh] w-full max-w-lg overflow-y-auto p-4 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div id="sdg-edit-booking-title" className="text-base font-extrabold tracking-tight text-slate-900">
                  Modifier la réservation
                </div>
                <p className="mt-1 text-sm text-slate-600">{editForm.email || "Réservation du logement ouvert"}</p>
              </div>
              <button type="button" className="sdg-btn-soft" disabled={editSaving} onClick={() => setEditOpen(false)}>
                Fermer
              </button>
            </div>
            {editLoading ? (
              <div className="mt-4 text-sm font-semibold text-slate-700">Chargement…</div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="sdg-label" htmlFor="edit-booking-start">
                      Arrivée
                    </label>
                    <DateField id="edit-booking-start" className="sdg-input" value={editForm.start} onChange={(ymd) => setEditForm({ ...editForm, start: ymd })} />
                  </div>
                  <div>
                    <label className="sdg-label" htmlFor="edit-booking-end">
                      Départ
                    </label>
                    <DateField id="edit-booking-end" className="sdg-input" value={editForm.end} onChange={(ymd) => setEditForm({ ...editForm, end: ymd })} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="sdg-label" htmlFor="edit-booking-firstname">
                      Prénom
                    </label>
                    <input id="edit-booking-firstname" className="sdg-input" value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
                  </div>
                  <div>
                    <label className="sdg-label" htmlFor="edit-booking-lastname">
                      Nom
                    </label>
                    <input id="edit-booking-lastname" className="sdg-input" value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="sdg-label" htmlFor="edit-booking-phone">
                    Téléphone
                  </label>
                  <input id="edit-booking-phone" className="sdg-input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
                <div className="mt-3">
                  <label className="sdg-label" htmlFor="edit-booking-residence">
                    Adresse de résidence principale
                  </label>
                  <textarea
                    id="edit-booking-residence"
                    className="sdg-input min-h-20"
                    value={editForm.residenceAddress}
                    onChange={(e) => setEditForm({ ...editForm, residenceAddress: e.target.value })}
                  />
                </div>
                <div className="mt-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={editForm.platformEnabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        if (!enabled) {
                          setEditFile(null);
                          setEditPreview((current) => {
                            if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
                            return null;
                          });
                        } else if (editForm.hasImage) {
                          setEditPreview(`/api/admin/bookings/${editForm.id}/platform-image`);
                        }
                        setEditForm({ ...editForm, platformEnabled: enabled, platform: editForm.platform || DEFAULT_BOOKING_PLATFORM });
                      }}
                    />
                    Plateforme
                  </label>
                  {editForm.platformEnabled ? (
                    <>
                      <select
                        className="sdg-input mt-2"
                        aria-label="Plateforme de location"
                        value={editForm.platform}
                        onChange={(e) => setEditForm({ ...editForm, platform: e.target.value })}
                      >
                        <optgroup label="Principales">
                          {MAIN_BOOKING_PLATFORMS.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Autres">
                          {OTHER_BOOKING_PLATFORMS.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <label className="sdg-label mt-3" htmlFor="edit-booking-platform-image">
                        Image liée à la réservation
                      </label>
                      <input
                        id="edit-booking-platform-image"
                        className="mt-1 block w-full text-sm text-slate-700"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setEditFile(file);
                          setEditPreview((current) => {
                            if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
                            return file ? URL.createObjectURL(file) : editForm.hasImage ? `/api/admin/bookings/${editForm.id}/platform-image` : null;
                          });
                        }}
                      />
                      {editPreview ? <img src={editPreview} alt="Capture de la plateforme" className="mt-2 max-h-40 rounded-xl border border-slate-200" /> : null}
                    </>
                  ) : null}
                </div>
                <div className="mt-4">
                  <label className="sdg-label" htmlFor="edit-booking-notes">
                    Message (optionnel)
                  </label>
                  <textarea id="edit-booking-notes" className="sdg-input min-h-20" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                </div>
                {editError ? <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{editError}</div> : null}
                <div className="mt-4 flex justify-end">
                  <button type="button" className="sdg-btn-primary disabled:opacity-50" disabled={editSaving} onClick={() => void submitEditBooking()}>
                    {editSaving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {bookingModalId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setBookingModalId(null);
          }}
        >
          <div className="sdg-card max-h-[90dvh] w-full max-w-3xl overflow-y-auto p-4 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div>
                <div className="text-base font-extrabold tracking-tight text-slate-900">Détail réservation</div>
                <div className="mt-1 text-sm text-slate-600">BookingId: {bookingModalId}</div>
              </div>
              <div className="flex gap-2 self-end sm:self-auto">
                {bookingModalData?.booking ? (
                  <button
                    type="button"
                    className="sdg-btn-danger"
                    onClick={() => {
                      if (!bookingModalId || !bookingModalData?.booking) return;
                      void deleteBooking(bookingModalId, bookingModalData.booking.status);
                    }}
                  >
                    Supprimer
                  </button>
                ) : null}
                <button className="sdg-btn-soft" onClick={() => setBookingModalId(null)}>
                  Fermer
                </button>
              </div>
            </div>

            {bookingLoading ? (
              <div className="mt-4 text-sm font-semibold text-slate-700">Chargement…</div>
            ) : bookingModalData ? (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white/60 p-4">
                  <div className="text-sm font-extrabold text-slate-900">Client</div>
                  <div className="mt-2 text-sm text-slate-800">
                    <div className="font-semibold">
                      {[bookingModalData.booking.user?.firstName, bookingModalData.booking.user?.lastName].filter(Boolean).join(" ") ||
                        bookingModalData.booking.user?.profileName ||
                        "-"}
                    </div>
                    <div>{bookingModalData.booking.user?.email ?? "-"}</div>
                    <div>{bookingModalData.booking.user?.phone ?? "-"}</div>
                    {bookingModalData.booking.user?.residenceAddress ? (
                      <div className="mt-1 whitespace-pre-wrap">{bookingModalData.booking.user.residenceAddress}</div>
                    ) : null}
                  </div>
                  <div className="mt-4 text-sm font-extrabold text-slate-900">Réservation</div>
                  <div className="mt-2 text-sm text-slate-800">
                    <div>
                      <span className="font-semibold">Du</span> {new Date(bookingModalData.booking.startDate).toLocaleDateString("fr-FR")}{" "}
                      <span className="font-semibold">au</span> {new Date(bookingModalData.booking.endDate).toLocaleDateString("fr-FR")}
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">Statut:</span> {bookingModalData.booking.status}
                    </div>
                    {bookingModalData.booking.platform ? (
                      <div className="mt-1">
                        <span className="font-semibold">Plateforme:</span> {bookingModalData.booking.platform}
                      </div>
                    ) : null}
                    {bookingModalData.booking.platformImageType ? (
                      <img
                        alt="Image liée à la réservation"
                        className="mt-3 max-h-64 rounded-xl border border-slate-200"
                        src={`/api/admin/bookings/${bookingModalId}/platform-image`}
                      />
                    ) : null}
                    {bookingModalData.booking.notes ? (
                      <div className="mt-2">
                        <div className="text-xs font-extrabold text-slate-700">Message</div>
                        <div className="whitespace-pre-wrap text-sm text-slate-800">{bookingModalData.booking.notes}</div>
                      </div>
                    ) : null}
                    {bookingModalData.booking.equipment ? (
                      <div className="mt-2">
                        <div className="text-xs font-extrabold text-slate-700">Équipement</div>
                        <div className="whitespace-pre-wrap text-sm text-slate-800">{bookingModalData.booking.equipment}</div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/60 p-4">
                  <div className="text-sm font-extrabold text-slate-900">Prix total</div>
                  <div className="mt-2 text-sm text-slate-800">
                    <div>
                      <span className="font-semibold">Nuits:</span> {bookingModalData.pricing.nightsCount}
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">Total (avant promo):</span>{" "}
                      {(bookingModalData.pricing.totalBeforePromoCents / 100).toFixed(0)}€
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">Promos jour:</span> -{(bookingModalData.pricing.totalPromoCents / 100).toFixed(0)}€
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">Sous-total (après promos jour):</span>{" "}
                      {(
                        (bookingModalData.pricing.totalAfterDayPromosCents ??
                          bookingModalData.pricing.totalBeforePromoCents - bookingModalData.pricing.totalPromoCents) /
                        100
                      ).toFixed(0)}€
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">Promo séjour:</span>{" "}
                      {bookingModalData.pricing.stayPromo
                        ? `-${((bookingModalData.pricing.totalStayPromoCents ?? 0) / 100).toFixed(0)}€ (${bookingModalData.pricing.stayPromo.promoPercent}%${
                            bookingModalData.pricing.stayPromo.label ? ` — ${bookingModalData.pricing.stayPromo.label}` : ""
                          })`
                        : "—"}
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="font-semibold">Sous-total séjour (nuits):</span> {(bookingModalData.pricing.totalCents / 100).toFixed(0)}€
                    </div>
                    {(bookingModalData.pricing.ancillaryFees ?? []).length > 0 ? (
                      <div className="mt-2 border-t border-slate-200/70 pt-2">
                        <div className="font-semibold">Frais annexes</div>
                        <ul className="mt-1 list-inside list-disc text-slate-800">
                          {(bookingModalData.pricing.ancillaryFees ?? []).map((a: { id?: string; label: string; priceCents: number }, i: number) => (
                            <li key={a.id ?? `${a.label}-${i}`}>
                              {a.label}: +{(a.priceCents / 100).toFixed(0)}€
                            </li>
                          ))}
                        </ul>
                        <div className="mt-1">
                          <span className="font-semibold">Total frais annexes:</span> +{((bookingModalData.pricing.ancillaryTotalCents ?? 0) / 100).toFixed(0)}€
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-2 text-base font-extrabold text-slate-900">
                      Total: {((bookingModalData.pricing.grandTotalCents ?? bookingModalData.pricing.totalCents) / 100).toFixed(0)}€
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                    <div className="max-h-[260px] overflow-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead className="sticky top-0 bg-white/80 backdrop-blur">
                          <tr className="border-b border-slate-200/70">
                            <th className="px-3 py-2 font-extrabold text-slate-700">Nuit</th>
                            <th className="px-3 py-2 font-extrabold text-slate-700">Prix</th>
                            <th className="px-3 py-2 font-extrabold text-slate-700">Promo</th>
                            <th className="px-3 py-2 font-extrabold text-slate-700">Final</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bookingModalData.pricing.nights.map((n: any) => (
                            <tr key={n.day} className="border-b border-slate-200/60 last:border-b-0">
                              <td className="px-3 py-2 font-semibold text-slate-800">{n.day}</td>
                              <td className="px-3 py-2 text-slate-800">{(n.priceCents / 100).toFixed(0)}€</td>
                              <td className="px-3 py-2 text-slate-800">
                                {n.promoPercent ? `-${n.promoPercent}%` : "-"}
                                {n.promoLabel ? ` ${n.promoLabel}` : ""}
                                {n.missingConfig ? " (pas de config)" : ""}
                              </td>
                              <td className="px-3 py-2 font-extrabold text-slate-900">{(n.finalCents / 100).toFixed(0)}€</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-700">Aucune donnée.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

