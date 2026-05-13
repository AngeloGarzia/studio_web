import React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { DateClickArg } from "@fullcalendar/interaction";
import multiMonthPlugin from "@fullcalendar/multimonth";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type CalendarData = {
  bookings: Array<{ id: string; startDate: string; endDate: string; status: string }>;
  blocks: Array<{ id: string; startDate: string; endDate: string; reason?: string | null }>;
  dayConfigs?: Array<{
    id: string;
    date: string;
    priceCents: number;
    promoPercent?: number | null;
    promoLabel?: string | null;
    arrivalAllowed?: boolean | null;
    departureAllowed?: boolean | null;
  }>;
};

function dayConfigSortKey(d: { date: string }): string {
  return d.date.slice(0, 10);
}

/** Fusionne les chargements calendrier (navigation mois / plages étendues) sans perdre les tuiles déjà connues. */
function mergeCalendarData(prev: CalendarData | null, incoming: CalendarData): CalendarData {
  if (!prev) return incoming;
  const dcMap = new Map<string, NonNullable<CalendarData["dayConfigs"]>[number]>();
  for (const d of prev.dayConfigs ?? []) {
    dcMap.set(dayConfigSortKey(d), d);
  }
  for (const d of incoming.dayConfigs ?? []) {
    dcMap.set(dayConfigSortKey(d), d);
  }
  const bookingById = new Map((prev.bookings ?? []).map((b) => [b.id, b]));
  for (const b of incoming.bookings ?? []) {
    bookingById.set(b.id, b);
  }
  const blockById = new Map((prev.blocks ?? []).map((b) => [b.id, b]));
  for (const b of incoming.blocks ?? []) {
    blockById.set(b.id, b);
  }
  return {
    bookings: Array.from(bookingById.values()),
    blocks: Array.from(blockById.values()),
    dayConfigs: Array.from(dcMap.values())
  };
}
type PortfolioItem = { id: string; title?: string | null; type: "image" | "video" | string; url?: string | null; publicUrl?: string | null };

type PublicStayPromo = {
  id: string;
  validFrom: string;
  validToInclusive: string;
  minStayNights: number;
  promoPercent: number;
  label?: string | null;
};

function NoEntryIcon({ title, className }: { title: string; className: string }) {
  return (
    <svg
      aria-label={title}
      role="img"
      title={title}
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 shrink-0 md:h-4 md:w-4 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
      <path d="M7.5 16.5L16.5 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Date affichée sur la cellule agenda (fuseau navigateur — évite décalage +1 jour vs UTC sur .toISOString()). */
function localDayKey(d: Date) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Jour civil de la case FullCalendar (priorité à dateStr).
 * Ne jamais utiliser `toISOString().slice(0,10)` sur `arg.date` pour une case : à Paris en été,
 * le 02/06 minuit local = 01/06 en UTC → on affichait par erreur les règles du 01/06 sur la case du 02/06.
 */
function fcCellYmd(arg: { date: Date; dateStr?: string }): string {
  const s = arg.dateStr?.trim();
  if (s && s.length >= 10) return s.slice(0, 10);
  return localDayKey(arg.date);
}

/** +1 jour calendrier local (même logique que l’admin pour les plages bloquées). */
function addDaysLocal(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** +N jours en calendrier local (cohérent avec dateStr FullCalendar). */
function addWallDaysYmd(ymd: string, deltaDays: number): string {
  const [ys, ms, ds] = ymd.slice(0, 10).split("-");
  const t = new Date(Number(ys), Number(ms) - 1, Number(ds) + deltaDays);
  return localDayKey(t);
}

function dbNightYmd(d: Date | string) {
  return new Date(d).toISOString().slice(0, 10);
}

/** Libellés Arrivée / Départ : aligné sur le jour civil de la case (dateStr FC), cohérent avec les clics. */
function cellMatchesLabelYmd(arg: { date: Date; dateStr?: string }, ymd: string | null): boolean {
  if (!ymd || ymd.length < 10) return false;
  return fcCellYmd(arg) === ymd.slice(0, 10);
}

/** Nuits calendaires [startStr, endStr) — endStr exclus (convention FullCalendar). */
function eachNightBetween(startStr: string, endExclusiveStr: string): string[] {
  const from = startStr.slice(0, 10);
  const endEx = endExclusiveStr.slice(0, 10);
  const nights: string[] = [];
  for (let cur = from; cur < endEx; cur = addWallDaysYmd(cur, 1)) {
    nights.push(cur);
    if (nights.length > 3700) break;
  }
  return nights;
}

/** Toutes les nuits entre deux jours inclus (double-clic desktop). */
function eachNightInclusive(aYmd: string, bYmd: string): string[] {
  const sorted = [aYmd.slice(0, 10), bYmd.slice(0, 10)].sort();
  const lo = sorted[0]!;
  const hi = sorted[1]!;
  const nights: string[] = [];
  for (let cur = lo; ; cur = addWallDaysYmd(cur, 1)) {
    nights.push(cur);
    if (cur === hi) break;
    if (nights.length > 3700) break;
  }
  return nights;
}

/** Affichage type 02/06/26 (JJ/MM/AA) à partir d'une date YYYY-MM-DD ou ISO. */
function formatJjMmAa(isoDateStr: string): string {
  const ymd = isoDateStr.slice(0, 10);
  const d = new Date(`${ymd}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });
}

/** JJ/MM/AAAA (UTC), cohérent avec les nuits stockées à minuit UTC. */
function formatDdMmYyyyUtc(isoDateStr: string): string {
  const ymd = isoDateStr.slice(0, 10);
  const d = new Date(`${ymd}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

/** Affiche des centimes comme euros entiers (arrondi comme ailleurs sur le site). */
function centsAsEuroIntegerStr(cents: number): string {
  return (Math.round(cents) / 100).toFixed(0);
}

export function HomePage() {
  const { state, refresh } = useAuth();

  const greetFirstName =
    state.status === "authed"
      ? (() => {
          const p = state.me.profileName?.trim();
          if (p) {
            const first = p.split(/\s+/)[0] ?? "";
            if (first) return first.charAt(0).toLocaleUpperCase("fr-FR") + first.slice(1).toLocaleLowerCase("fr-FR");
          }
          const local = state.me.email.split("@")[0] ?? "";
          if (local) return local.charAt(0).toLocaleUpperCase("fr-FR") + local.slice(1).toLocaleLowerCase("fr-FR");
          return "toi";
        })()
      : null;

  const [wide, setWide] = React.useState<boolean>(() => (typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false));
  const calRef = React.useRef<FullCalendar | null>(null);
  const demandeRef = React.useRef<HTMLDivElement>(null);
  const [settings, setSettings] = React.useState<any>(null);
  const [cal, setCal] = React.useState<CalendarData | null>(null);
  const [portfolio, setPortfolio] = React.useState<PortfolioItem[]>([]);
  const [stayPromos, setStayPromos] = React.useState<PublicStayPromo[]>([]);
  const [slide, setSlide] = React.useState(0);
  const [select, setSelect] = React.useState<{ start: string; end: string } | null>(null);
  const [notes, setNotes] = React.useState("");
  const [equipment, setEquipment] = React.useState("");
  const [guestName, setGuestName] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [pricingPreview, setPricingPreview] = React.useState<Awaited<ReturnType<typeof api.publicBookingPricingPreview>> | null>(null);
  const [pricingPreviewLoading, setPricingPreviewLoading] = React.useState(false);
  const [pricingPreviewError, setPricingPreviewError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const s = await api.publicSettings();
      setSettings(s);
      const c = await api.publicCalendar();
      setCal(c as any);
      const p = (await api.publicPortfolio()) as any[];
      setPortfolio(p as any);
      try {
        const promos = await api.publicStayPromoRules();
        setStayPromos(Array.isArray(promos) ? promos : []);
      } catch {
        setStayPromos([]);
      }
    })();
  }, []);

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

  React.useEffect(() => {
    if (!portfolio.length) return;
    if (slide > portfolio.length - 1) setSlide(0);
  }, [portfolio.length, slide]);

  const nextSlide = React.useCallback(() => {
    setSlide((s) => (portfolio.length ? (s + 1) % portfolio.length : 0));
  }, [portfolio.length]);
  const prevSlide = React.useCallback(() => {
    setSlide((s) => (portfolio.length ? (s - 1 + portfolio.length) % portfolio.length : 0));
  }, [portfolio.length]);

  React.useEffect(() => {
    if (portfolio.length <= 1) return;
    const t = window.setInterval(() => {
      nextSlide();
    }, 3000);
    return () => window.clearInterval(t);
  }, [nextSlide, portfolio.length]);

  React.useEffect(() => {
    if (!select) {
      setPricingPreview(null);
      setPricingPreviewLoading(false);
      setPricingPreviewError(null);
      return;
    }
    let cancelled = false;
    setPricingPreviewLoading(true);
    setPricingPreview(null);
    setPricingPreviewError(null);
    void api
      .publicBookingPricingPreview({ startDate: select.start, endDate: select.end })
      .then((p) => {
        if (!cancelled) {
          setPricingPreview(p);
          setPricingPreviewError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPricingPreview(null);
          setPricingPreviewError("Impossible de calculer le tarif pour ces dates.");
        }
      })
      .finally(() => {
        if (!cancelled) setPricingPreviewLoading(false);
      });

    const rafOuter = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        demandeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafOuter);
    };
  }, [select]);

  const events = React.useMemo(() => {
    if (!cal) return [];
    const bookingEvents = (cal.bookings ?? []).map((b) => ({
      id: `b:${b.id}`,
      start: b.startDate,
      end: b.endDate,
      allDay: true,
      display: "background" as const,
      classNames: ["sdg-home-unavail-bg"]
    }));
    const blockEvents = (cal.blocks ?? []).map((blk) => ({
      id: `blk:${blk.id}`,
      start: blk.startDate,
      end: blk.endDate,
      allDay: true,
      display: "background" as const,
      classNames: ["sdg-home-unavail-bg"]
    }));
    return [...bookingEvents, ...blockEvents];
  }, [cal]);

  const blockedByDay = React.useMemo(() => {
    const set = new Set<string>();
    for (const blk of cal?.blocks ?? []) {
      const start = new Date(blk.startDate);
      const end = new Date(blk.endDate);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
      for (let d = new Date(start); d < end; d = addDaysLocal(d, 1)) {
        set.add(localDayKey(d));
      }
    }
    return set;
  }, [cal]);

  /** Nuitées déjà réservées (affichage + interaction calendrier accueil). */
  const bookingStatusByDay = React.useMemo(() => {
    const map = new Map<string, "CONFIRMED" | "PENDING">();
    for (const b of cal?.bookings ?? []) {
      if (b.status !== "CONFIRMED" && b.status !== "PENDING") continue;
      const start = new Date(b.startDate);
      const end = new Date(b.endDate);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
      for (let d = new Date(start); d < end; d = addDaysLocal(d, 1)) {
        const key = localDayKey(d);
        const existing = map.get(key);
        if (!existing) map.set(key, b.status as "CONFIRMED" | "PENDING");
        if (b.status === "CONFIRMED") map.set(key, "CONFIRMED");
      }
    }
    return map;
  }, [cal]);

  const priceByDay = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const dc of cal?.dayConfigs ?? []) {
      const utcKey = dbNightYmd(dc.date);
      const locKey = localDayKey(new Date(dc.date));
      map.set(utcKey, dc.priceCents);
      if (locKey !== utcKey) map.set(locKey, dc.priceCents);
    }
    return map;
  }, [cal]);

  const nightHasListedPrice = React.useCallback(
    (ymd: string) =>
      typeof priceByDay.get(ymd.slice(0, 10)) === "number" ||
      typeof priceByDay.get(dbNightYmd(`${ymd.slice(0, 10)}T12:00:00.000Z`)) === "number",
    [priceByDay]
  );

  const arrivalForbiddenByDay = React.useMemo(() => {
    const set = new Set<string>();
    for (const dc of cal?.dayConfigs ?? []) {
      if (dc.arrivalAllowed !== false) continue;
      const utcKey = dbNightYmd(dc.date);
      const locKey = localDayKey(new Date(dc.date));
      set.add(utcKey);
      if (locKey !== utcKey) set.add(locKey);
    }
    return set;
  }, [cal]);

  const departureForbiddenByDay = React.useMemo(() => {
    const set = new Set<string>();
    for (const dc of cal?.dayConfigs ?? []) {
      if (dc.departureAllowed !== false) continue;
      const utcKey = dbNightYmd(dc.date);
      const locKey = localDayKey(new Date(dc.date));
      set.add(utcKey);
      if (locKey !== utcKey) set.add(locKey);
    }
    return set;
  }, [cal]);

  const departureForbiddenForCheckoutYmd = React.useCallback(
    (checkoutYmd: string) =>
      departureForbiddenByDay.has(checkoutYmd) ||
      departureForbiddenByDay.has(dbNightYmd(`${checkoutYmd.slice(0, 10)}T12:00:00.000Z`)),
    [departureForbiddenByDay]
  );

  /** Première nuit à partir de l’arrivée qui n’est pas réservable (borne max du jour de départ FC). */
  const firstUnavailableNightFromArrivalYmd = React.useCallback(
    (arrivalYmd: string): string | null => {
      const start = arrivalYmd.slice(0, 10);
      const nightUnavailableForStay = (k: string) =>
        blockedByDay.has(k) || bookingStatusByDay.has(k) || !nightHasListedPrice(k);
      let d = start;
      for (let i = 0; i < 800; i++) {
        if (nightUnavailableForStay(d)) return d;
        d = addWallDaysYmd(d, 1);
      }
      return null;
    },
    [blockedByDay, bookingStatusByDay, nightHasListedPrice]
  );

  /** Dernier jour de départ FC cliquable (même logique qu’après clamp + repli départ interdit). */
  const maxCheckoutHintYmd = React.useCallback(
    (arrivalYmd: string): string | null => {
      const start = arrivalYmd.slice(0, 10);
      const firstBad = firstUnavailableNightFromArrivalYmd(start);
      if (!firstBad || !(firstBad > start)) return null;
      let ck = firstBad;
      while (ck > start && departureForbiddenForCheckoutYmd(ck)) {
        ck = addWallDaysYmd(ck, -1);
      }
      return ck > start ? ck : null;
    },
    [firstUnavailableNightFromArrivalYmd, departureForbiddenForCheckoutYmd]
  );

  /** Un seul mode de sélection : 1er clic = arrivée, 2e clic = départ (toutes largeurs ; pas de glisser). */
  const [clickStart, setClickStart] = React.useState<string | null>(null); // YYYY-MM-DD (calendrier local FC)
  const onDateClick = (arg: DateClickArg) => {
    if (!arg.dateStr) return;
    setOk(null);
    setError(null);

    const dayKey = arg.dateStr.slice(0, 10);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const clicked = new Date(arg.date);
    clicked.setHours(0, 0, 0, 0);
    if (clicked < today) {
      setError("Impossible de choisir une date passée.");
      return;
    }

    let anchorKey = clickStart;
    if (select) {
      calRef.current?.getApi()?.unselect();
      setSelect(null);
      setClickStart(null);
      anchorKey = null;
    }

    if (!anchorKey) {
      if (blockedByDay.has(dayKey)) {
        setError("Cette date est dans une période indisponible (bloquée par le propriétaire).");
        return;
      }
      if (bookingStatusByDay.has(dayKey)) {
        setError("Cette date est déjà réservée ou en demande.");
        return;
      }
      if (!nightHasListedPrice(dayKey)) {
        setError("Choisis uniquement une date d’arrivée où un tarif est affiché.");
        return;
      }
      setClickStart(dayKey);
      const calApi = calRef.current?.getApi();
      if (calApi) {
        const endEx = `${addWallDaysYmd(dayKey, 1)}T00:00:00.000Z`;
        calApi.select(new Date(`${dayKey}T00:00:00.000Z`), new Date(endEx));
      }
      return;
    }

    /** 2e clic = jour réel du départ (sans nuitée ce jour-là). Bornes FC [arrivee, depart). */
    const [startKeyFinal, rawCheckoutYmd] = anchorKey <= dayKey ? [anchorKey, dayKey] : [dayKey, anchorKey];

    if (!(rawCheckoutYmd > startKeyFinal)) {
      setError("La date de départ doit être après la date d’arrivée.");
      setClickStart(null);
      setSelect(null);
      calRef.current?.getApi()?.unselect();
      return;
    }

    const firstBad = firstUnavailableNightFromArrivalYmd(startKeyFinal);
    if (firstBad != null && !(firstBad > startKeyFinal)) {
      setError(
        "Impossible de réserver : la première nuit à partir de cette arrivée est déjà indisponible ou sans tarif affiché."
      );
      setClickStart(null);
      setSelect(null);
      calRef.current?.getApi()?.unselect();
      return;
    }

    let checkoutYmd = rawCheckoutYmd;
    if (firstBad != null && rawCheckoutYmd > firstBad) {
      checkoutYmd = firstBad;
      setOk(
        "La date de départ a été ajustée au dernier jour possible : ta dernière nuit est la veille du premier jour indisponible (bloqué, en demande ou sans tarif)."
      );
    }

    const arrivalOk =
      !arrivalForbiddenByDay.has(startKeyFinal) &&
      !arrivalForbiddenByDay.has(dbNightYmd(`${startKeyFinal}T12:00:00.000Z`));

    if (!arrivalOk) {
      setError("Arrivée non autorisée à cette date. Choisis un autre jour de début.");
      setClickStart(null);
      setSelect(null);
      calRef.current?.getApi()?.unselect();
      return;
    }

    while (checkoutYmd > startKeyFinal && departureForbiddenForCheckoutYmd(checkoutYmd)) {
      checkoutYmd = addWallDaysYmd(checkoutYmd, -1);
    }
    if (!(checkoutYmd > startKeyFinal)) {
      setError("Aucune fin de séjour possible : les jours de départ autorisés ne permettent pas ce créneau.");
      setClickStart(null);
      setSelect(null);
      calRef.current?.getApi()?.unselect();
      return;
    }

    const lastNightKey = addWallDaysYmd(checkoutYmd, -1);
    const tariffNights = eachNightInclusive(startKeyFinal, lastNightKey);
    if (tariffNights.some((k) => blockedByDay.has(k) || bookingStatusByDay.has(k))) {
      setError("La période chevauche des jours indisponibles (bloqués ou déjà réservés).");
      setClickStart(null);
      setSelect(null);
      calRef.current?.getApi()?.unselect();
      return;
    }
    if (!tariffNights.every((k) => nightHasListedPrice(k))) {
      setError("Chaque nuitée du séjour doit afficher un tarif (le jour du départ n’est pas compté en nuit).");
      setClickStart(null);
      setSelect(null);
      calRef.current?.getApi()?.unselect();
      return;
    }

    if (departureForbiddenForCheckoutYmd(checkoutYmd)) {
      setError("Départ non autorisé à cette date (jour du départ). Choisis une autre fin de séjour.");
      setClickStart(null);
      setSelect(null);
      calRef.current?.getApi()?.unselect();
      return;
    }

    const selStart = new Date(`${startKeyFinal}T00:00:00.000Z`);
    const selEnd = new Date(`${checkoutYmd}T00:00:00.000Z`);

    calRef.current?.getApi()?.select(selStart, selEnd);
    setSelect({
      start: `${startKeyFinal}T00:00:00.000Z`,
      end: `${checkoutYmd}T00:00:00.000Z`
    });
    setClickStart(null);
  };

  const submit = async () => {
    if (!select) return;
    const bookedNights = eachNightBetween(select.start, select.end);
    if (bookedNights.some((k) => blockedByDay.has(k) || bookingStatusByDay.has(k))) {
      setError("La période chevauche des jours indisponibles (bloqués ou déjà réservés).");
      return;
    }
    if (bookedNights.length === 0 || !bookedNights.every((k) => nightHasListedPrice(k))) {
      setError("La période doit inclure uniquement des nuitées avec tarif affiché.");
      return;
    }
    const isClientAuthed = state.status === "authed" && state.me.role === "CLIENT";
    if (!isClientAuthed) {
      if (!guestName.trim() || !guestEmail.trim() || !guestPhone.trim()) {
        setError("Nom, email et téléphone sont obligatoires pour envoyer une demande.");
        return;
      }
    }
    setError(null);
    setOk(null);
    setSubmitting(true);
    try {
      if (isClientAuthed) {
        await api.createBooking({
          startDate: select.start,
          endDate: select.end,
          notes: notes || undefined,
          equipment: equipment || undefined
        });
        setOk("Demande envoyée. Tu peux la voir dans « Mes réservations » ; l’admin est notifié dans la messagerie interne.");
      } else {
        await api.publicBookingRequest({
          startDate: select.start,
          endDate: select.end,
          name: guestName.trim(),
          email: guestEmail.trim(),
          phone: guestPhone.trim(),
          notes: notes || undefined,
          equipment: equipment || undefined
        });
        setOk("Demande envoyée. L’admin est notifié dans la messagerie interne (Messages).");
      }
      setSelect(null);
      setClickStart(null);
      calRef.current?.getApi()?.unselect();
      setNotes("");
      setEquipment("");
      setGuestName("");
      setGuestEmail("");
      setGuestPhone("");
      const c = await api.publicCalendar();
      setCal(c as any);
      await refresh();
    } catch (e: any) {
      if (Array.isArray(e?.issues) && e.issues.length) {
        const first = e.issues[0];
        const where = first?.path?.length ? ` (${first.path.join(".")})` : "";
        setError(`${first?.message ?? "Validation invalide"}${where}`);
      } else {
        setError(e?.error ?? "Erreur");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cancelHomeCalendarSelection = React.useCallback(() => {
    setSelect(null);
    setClickStart(null);
    calRef.current?.getApi()?.unselect();
  }, []);

  const calendarFetchTimerRef = React.useRef<number | null>(null);

  const onCalendarDatesSet = React.useCallback((info: { start: Date; end: Date }) => {
    if (calendarFetchTimerRef.current != null) window.clearTimeout(calendarFetchTimerRef.current);
    calendarFetchTimerRef.current = window.setTimeout(() => {
      calendarFetchTimerRef.current = null;
      const visibleStart = localDayKey(info.start);
      const endExclusive = localDayKey(info.end);
      const lastVisible = addWallDaysYmd(endExclusive, -1);
      const fetchFrom = addWallDaysYmd(visibleStart, -45);
      const fetchTo = addWallDaysYmd(lastVisible, 45);
      void api.publicCalendar(fetchFrom, fetchTo).then((raw) => {
        const c = raw as CalendarData;
        setCal((prev) => mergeCalendarData(prev, c));
      });
    }, 350);
  }, []);

  React.useEffect(() => {
    return () => {
      if (calendarFetchTimerRef.current != null) window.clearTimeout(calendarFetchTimerRef.current);
    };
  }, []);

  return (
    <>
      {submitting ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-busy="true"
          aria-labelledby="sdg-submitting-title"
        >
          <div className="sdg-card max-w-sm rounded-2xl px-6 py-5 text-center shadow-xl">
            <p id="sdg-submitting-title" className="text-sm font-semibold text-slate-800">
              Traitement en cours
            </p>
          </div>
        </div>
      ) : null}
      <div className="sdg-container pt-10 pb-6">
        <h1 className="sdg-title sdg-title-elegant">{settings?.studioName ?? "Studio des Grenadiers"}</h1>
        {greetFirstName ? (
          <p className="mt-2 text-base font-semibold tracking-tight text-water-900 md:text-lg" lang="fr">
            Bonjour {greetFirstName}
          </p>
        ) : null}
        <p className={`sdg-subtitle sdg-subtitle-hero ${greetFirstName ? "mt-3" : "mt-2"}`}>
          Réservations en direct propriétaire. Prise de contact téléphonique. Contrat/bail envoyé par la poste. 100% Humain.
        </p>

        {stayPromos.length > 0 ? (
          <div className="sdg-card mt-6 border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-white to-sun-50/40 p-4 md:p-5">
            <div className="sdg-promo-hero-title px-1">Promotion sur la durée du séjour</div>
            <ul className="mt-4 space-y-2">
              {stayPromos.map((rule) => {
                const from = formatDdMmYyyyUtc(rule.validFrom);
                const to = formatDdMmYyyyUtc(rule.validToInclusive);
                const n = rule.minStayNights;
                const nuitLabel = n <= 1 ? "1 nuit consécutive" : `${n} nuits consécutives minimum`;
                return (
                  <li
                    key={rule.id}
                    className="rounded-2xl border border-emerald-100/90 bg-white/70 px-3 py-2.5 text-sm text-slate-900 shadow-sm backdrop-blur-sm md:px-4 md:py-3"
                  >
                    <span className="font-semibold text-emerald-950">
                      Du {from} au {to}
                    </span>
                    <span className="text-slate-800">
                      {" "}
                      · {rule.promoPercent} % de réduction
                      {rule.label?.trim() ? <> — {rule.label.trim()}</> : null} · {nuitLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="sdg-promo-reduction-hint">
              La réduction s'appliquera une fois les dates sélectionnées.
            </p>
          </div>
        ) : null}

        {/* Tuile du portfolio (carrousel) - sans texte */}
        <div className="mt-6 p-0">
          <div className="mt-4">
            {portfolio.length === 0 ? (
              <div className="py-6 text-sm text-slate-600">Aucun média publié pour le moment.</div>
            ) : (
              <div className="relative overflow-visible bg-transparent">
                <div className="relative z-0 aspect-[16/10] w-full bg-transparent">
                  {portfolio.map((m, i) => {
                    const src = (m as any)?.url ?? (m as any)?.publicUrl ?? "";
                    const active = i === slide;
                    return (
                      <div
                        key={m.id}
                        className={`absolute inset-0 transition-opacity duration-[1600ms] ease-linear ${active ? "opacity-100" : "opacity-0"}`}
                        aria-hidden={!active}
                      >
                        {m?.type === "video" ? (
                          src ? (
                            <video controls className="h-full w-full object-cover drop-shadow-xl">
                              <source src={src} />
                            </video>
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-slate-600">Vidéo indisponible</div>
                          )
                        ) : src ? (
                          <img src={src} alt={m?.title ?? "media"} className="h-full w-full object-contain drop-shadow-xl" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-slate-600">Image indisponible</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-2xl border border-white/40 bg-white/45 px-3 py-2 text-sm font-extrabold text-slate-900 shadow hover:bg-white/70 backdrop-blur"
                  aria-label="Précédent"
                  onClick={prevSlide}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-2xl border border-white/40 bg-white/45 px-3 py-2 text-sm font-extrabold text-slate-900 shadow hover:bg-white/70 backdrop-blur"
                  aria-label="Suivant"
                  onClick={nextSlide}
                >
                  ›
                </button>

                <div className="absolute bottom-3 left-0 right-0 z-10 flex items-center justify-center gap-2">
                  {portfolio.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Aller à la slide ${i + 1}`}
                      className={`h-2.5 w-2.5 rounded-full border border-white/70 shadow ${
                        i === slide ? "bg-water-600" : "bg-white/70 hover:bg-white"
                      }`}
                      onClick={() => setSlide(i)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sdg-card mt-6 p-5">
          <div>
            <div className="text-sm font-extrabold tracking-tight text-slate-900">Réserver une période</div>
            <p className="mt-2 text-center text-sm font-semibold text-slate-700 md:text-left">
              Cliquez sur une date d'arrivée et de départ
            </p>
            <p className="mt-1.5 text-center text-sm font-semibold text-rose-700 md:text-left">
              Les jours en rose = nuits déjà prises. Le jour du départ peut être un jour rose : tu pars ce jour-là sans y
              dormir.
            </p>
            <div className="mt-1 text-sm text-slate-600">
              <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-xs text-slate-600 md:justify-start">
                <span className="inline-flex items-center gap-1.5">
                  <NoEntryIcon title="Jour où une arrivée est impossible" className="text-sky-700" /> Arrivée impossible
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <NoEntryIcon title="Jour où un départ est impossible" className="text-rose-700" /> Départ impossible
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="sdg-container pb-10">
        <div className="sdg-card sdg-home-calendar p-3 md:p-5">
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
            height="auto"
            fixedWeekCount
            showNonCurrentDates={false}
            selectable={false}
            dateClick={onDateClick}
            datesSet={onCalendarDatesSet}
            events={events as any}
            validRange={{
              start: (() => {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                return d;
              })()
            }}
            dayCellClassNames={(arg) => {
              const classes: string[] = [];
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const d = new Date(arg.date);
              d.setHours(0, 0, 0, 0);
              const cellYmd = fcCellYmd(arg);
              const pickingCheckout = !select && Boolean(clickStart);
              const checkoutBoundaryYmd = pickingCheckout && clickStart ? maxCheckoutHintYmd(clickStart) : null;
              const isCheckoutBoundary =
                Boolean(checkoutBoundaryYmd && checkoutBoundaryYmd === cellYmd && checkoutBoundaryYmd > clickStart);

              if (blockedByDay.has(cellYmd)) classes.push("sdg-blocked-day");
              const st = bookingStatusByDay.get(cellYmd);
              if (st === "CONFIRMED") classes.push("sdg-booked-day");
              else if (st === "PENDING") classes.push("sdg-booked-day-pending");
              if (d < today) classes.push("sdg-past-day");
              else if (!isCheckoutBoundary && (!priceByDay.has(cellYmd) || blockedByDay.has(cellYmd) || st != null)) {
                classes.push("sdg-home-no-price");
              }
              if (isCheckoutBoundary) classes.push("sdg-home-checkout-boundary-day");
              return classes;
            }}
            dayCellContent={(arg) => {
              const cellYmd = fcCellYmd(arg);
              const bookingSt = bookingStatusByDay.get(cellYmd);
              const pickingCheckout = !select && Boolean(clickStart);
              const checkoutBoundaryYmd = pickingCheckout && clickStart ? maxCheckoutHintYmd(clickStart) : null;
              const isCheckoutBoundary =
                Boolean(checkoutBoundaryYmd && checkoutBoundaryYmd === cellYmd && checkoutBoundaryYmd > clickStart);

              const hidePrice = blockedByDay.has(cellYmd) || bookingSt != null;
              const priceCents = hidePrice ? undefined : priceByDay.get(cellYmd);
              const noArrival = arrivalForbiddenByDay.has(cellYmd);
              const noDeparture = departureForbiddenByDay.has(cellYmd);
              const arrivalYmd = select?.start.slice(0, 10) ?? null;
              const departureYmd = select?.end.slice(0, 10) ?? null;
              const pendingArrivalYmd = clickStart && !select ? clickStart : null;
              let showNoArrivalIcon = noArrival;
              let showNoDepartureIcon = noDeparture;
              if (pickingCheckout && clickStart) {
                showNoArrivalIcon = noArrival && cellMatchesLabelYmd(arg, clickStart);
                showNoDepartureIcon = noDeparture && !isCheckoutBoundary;
              } else if (select && arrivalYmd && departureYmd) {
                showNoArrivalIcon = noArrival && cellMatchesLabelYmd(arg, arrivalYmd);
                showNoDepartureIcon = noDeparture && cellMatchesLabelYmd(arg, departureYmd);
              }
              const showArrival =
                cellMatchesLabelYmd(arg, arrivalYmd) || cellMatchesLabelYmd(arg, pendingArrivalYmd);
              const showDeparture = departureYmd ? cellMatchesLabelYmd(arg, departureYmd) : false;
              const strikeDeparturePrice = showDeparture && typeof priceCents === "number";
              return (
                <div className="flex min-h-[40px] w-full flex-col items-end gap-0.5">
                  <div className="flex w-full items-start justify-between gap-1">
                    <div className="text-xs font-extrabold text-slate-900">{arg.dayNumberText}</div>
                    {(showNoArrivalIcon || showNoDepartureIcon) && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        {showNoArrivalIcon ? (
                          <NoEntryIcon title="Arrivée impossible ce jour-là" className="text-sky-700" />
                        ) : null}
                        {showNoDepartureIcon ? (
                          <NoEntryIcon title="Départ impossible ce jour-là" className="text-rose-700" />
                        ) : null}
                      </div>
                    )}
                  </div>
                  {typeof priceCents === "number" ? (
                    <div
                      className={`mt-0.5 rounded-md bg-sun-100 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-900 ${
                        strikeDeparturePrice ? "ring-1 ring-slate-400/60" : ""
                      }`}
                      title={strikeDeparturePrice ? "Tarif barré : pas de nuitée ce jour (jour du départ)" : undefined}
                    >
                      <span className={strikeDeparturePrice ? "line-through decoration-2 decoration-slate-700" : undefined}>
                        {(priceCents / 100).toFixed(0)}€
                      </span>
                    </div>
                  ) : null}
                  {isCheckoutBoundary ? (
                    <div className="mt-0.5 w-full rounded-md border border-emerald-500/80 bg-emerald-50/95 px-1 py-0.5 text-center text-[9px] font-extrabold leading-tight text-emerald-900 md:text-[10px]">
                      Départ possible
                    </div>
                  ) : null}
                  {(showArrival || showDeparture) && (
                    <div className="mt-0.5 w-full space-y-0.5 text-center leading-tight">
                      {showArrival ? (
                        <div className="text-[9px] font-extrabold text-red-600 md:text-[10px]">Arrivée</div>
                      ) : null}
                      {showDeparture ? (
                        <div className="text-[9px] font-extrabold text-red-600 md:text-[10px]">Départ</div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            }}
          />
        </div>

        {select && (
          <div
            ref={demandeRef}
            id="sdg-demande-reservation"
            className="sdg-card mt-4 scroll-mt-24 p-4 md:scroll-mt-28 md:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div>
                <div className="text-base font-extrabold tracking-tight text-slate-900">Demande de réservation</div>
                <div className="mt-1 text-sm text-slate-600">
                  <span className="font-semibold">Du</span> {formatDdMmYyyyUtc(select.start)}{" "}
                  <span className="font-semibold">au</span> {formatDdMmYyyyUtc(select.end)}{" "}
                  <span className="font-normal text-slate-500">(jour du départ)</span>
                </div>
              </div>
              <button type="button" className="sdg-btn-soft self-end sm:self-auto" onClick={cancelHomeCalendarSelection}>
                Fermer
              </button>
            </div>

            {(pricingPreviewLoading || pricingPreviewError) && (
              <div className="mt-4 space-y-2">
                {pricingPreviewLoading ? (
                  <div className="rounded-2xl border border-slate-200/90 bg-white/60 px-4 py-3 text-sm font-semibold text-slate-600">
                    Calcul du tarif…
                  </div>
                ) : null}
                {pricingPreviewError && !pricingPreviewLoading ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{pricingPreviewError}</div>
                ) : null}
              </div>
            )}

            {pricingPreview ? (
              <div className="mt-4 rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-white/98 to-emerald-50/40 p-4">
                <div className="text-sm font-extrabold tracking-tight text-slate-900">Récapitulatif</div>
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  <div>
                    <span className="font-semibold">Période :</span> du {formatDdMmYyyyUtc(pricingPreview.startKey)} au{" "}
                    {formatDdMmYyyyUtc(pricingPreview.endKey)}
                    <span className="text-slate-500"> — jour du départ</span>
                  </div>
                  <div>
                    <span className="font-semibold">Arrivée :</span> {formatDdMmYyyyUtc(pricingPreview.startKey)}
                    {settings?.checkInTime ? (
                      <span className="text-slate-800">
                        {" "}
                        à partir de <span className="font-semibold tabular-nums">{settings.checkInTime}</span>
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <span className="font-semibold">Départ :</span> {formatDdMmYyyyUtc(pricingPreview.endKey)}
                    {settings?.checkOutTime ? (
                      <span className="text-slate-800">
                        {" "}
                        au plus tard à <span className="font-semibold tabular-nums">{settings.checkOutTime}</span>
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <span className="font-semibold">Nuitées :</span> {pricingPreview.nightsCount}
                  </div>
                </div>
                {pricingPreview.nights.some((n) => n.missingConfig) ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
                    Certaines dates n’ont pas encore de tarif renseigné : le montant peut être sous-estimé.
                  </div>
                ) : null}

                {(pricingPreview.totalPromoCents > 0 ||
                  (pricingPreview.stayPromo && (pricingPreview.totalStayPromoCents ?? 0) > 0)) ? (
                  <div className="mt-4 rounded-xl border border-emerald-200/90 bg-emerald-50/60 px-3 py-2.5">
                    <div className="text-xs font-extrabold uppercase tracking-wide text-emerald-950/90">Promotions</div>
                    <ul className="mt-2 space-y-1.5 text-sm text-slate-800">
                      {pricingPreview.totalPromoCents > 0 ? (
                        <li className="flex justify-between gap-2">
                          <span>Promotions calendrier (nuits)</span>
                          <span className="shrink-0 font-extrabold tabular-nums text-emerald-800">
                            −{centsAsEuroIntegerStr(pricingPreview.totalPromoCents)} €
                          </span>
                        </li>
                      ) : null}
                      {pricingPreview.stayPromo && pricingPreview.totalStayPromoCents > 0 ? (
                        <li className="flex justify-between gap-2">
                          <span>
                            Promo séjour ({pricingPreview.stayPromo.promoPercent}%
                            {pricingPreview.stayPromo.label ? ` · ${pricingPreview.stayPromo.label}` : ""})
                          </span>
                          <span className="shrink-0 font-extrabold tabular-nums text-emerald-800">
                            −{centsAsEuroIntegerStr(pricingPreview.stayPromo.promoCents)} €
                          </span>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">Aucune promotion appliquée sur cette période.</p>
                )}

                {(pricingPreview.ancillaryFees ?? []).length > 0 && (pricingPreview.ancillaryTotalCents ?? 0) > 0 ? (
                  <div className="mt-4 rounded-xl border border-amber-100/90 bg-amber-50/50 px-3 py-2.5">
                    <div className="text-xs font-extrabold uppercase tracking-wide text-amber-900/90">Frais annexes</div>
                    <ul className="mt-2 space-y-1 text-sm text-slate-800">
                      {(pricingPreview.ancillaryFees ?? []).map((f) => (
                        <li key={f.id} className="flex justify-between gap-2">
                          <span>{f.label}</span>
                          <span className="shrink-0 font-semibold tabular-nums">+{centsAsEuroIntegerStr(f.priceCents)} €</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 border-t border-slate-200/80 pt-4">
                  {(pricingPreview.ancillaryTotalCents ?? 0) > 0 ? (
                    <div className="w-full space-y-2 text-right">
                      <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
                        {pricingPreview.totalCents < pricingPreview.totalBeforePromoCents ? (
                          <span className="text-lg font-semibold tabular-nums text-slate-400 line-through decoration-slate-400">
                            {centsAsEuroIntegerStr(pricingPreview.totalBeforePromoCents)} €
                          </span>
                        ) : null}
                        <div>
                          <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Séjour (nuits)</div>
                          <div className="text-xl font-extrabold tabular-nums text-slate-900">
                            {centsAsEuroIntegerStr(pricingPreview.totalCents)} €
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Total avec frais annexes</div>
                        <div className="text-2xl font-extrabold tabular-nums text-slate-900">
                          {centsAsEuroIntegerStr(pricingPreview.grandTotalCents ?? pricingPreview.totalCents)} €
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {pricingPreview.totalCents < pricingPreview.totalBeforePromoCents ? (
                        <span className="text-xl font-semibold tabular-nums text-slate-400 line-through decoration-slate-400">
                          {centsAsEuroIntegerStr(pricingPreview.totalBeforePromoCents)} €
                        </span>
                      ) : null}
                      <div className="text-right">
                        <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Total estimé</div>
                        <div className="text-2xl font-extrabold tabular-nums text-slate-900">
                          {centsAsEuroIntegerStr(pricingPreview.totalCents)} €
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <p className="mt-3 text-center text-[11px] leading-snug text-slate-500">
                  Estimation indicative (prix et promos actuels). Le propriétaire confirme le détail lors de l’échange.
                </p>
              </div>
            ) : null}

            {state.status === "authed" && state.me.role !== "CLIENT" ? (
              <div className="mt-4 rounded-2xl border border-sun-200 bg-sun-50 p-3 text-sm text-slate-800">Tu es connecté en admin.</div>
            ) : (
              <>
                {state.status !== "authed" && (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <label className="sdg-label">Nom</label>
                      <input className="sdg-input" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                    </div>
                    <div>
                      <label className="sdg-label">Email</label>
                      <input className="sdg-input" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} type="email" />
                    </div>
                    <div>
                      <label className="sdg-label">Téléphone</label>
                      <input className="sdg-input" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
                    </div>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="sdg-label">Message (optionnel)</label>
                    <textarea className="sdg-input min-h-[100px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div>
                    <label className="sdg-label">Infos équipement / besoins (optionnel)</label>
                    <textarea className="sdg-input min-h-[100px]" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
                  </div>
                </div>
                {error && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                    {error}
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="sdg-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={submitting}
                    onClick={() => void submit()}
                  >
                    Envoyer la demande
                  </button>
                  <button type="button" className="sdg-btn-soft" onClick={cancelHomeCalendarSelection}>
                    Annuler
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {ok && !select && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            {ok}
          </div>
        )}
      </div>
    </>
  );
}

