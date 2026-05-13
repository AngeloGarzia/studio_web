import React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { DateClickArg, DateSelectArg } from "@fullcalendar/interaction";
import multiMonthPlugin from "@fullcalendar/multimonth";
import { api } from "../../lib/api";

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
    if (!cal) return [];
    const bookingEvents = (cal.bookings ?? []).map((b: any) => ({
      id: `b:${b.id}`,
      start: b.startDate,
      end: b.endDate,
      display: "background" as const,
      backgroundColor: b.status === "CONFIRMED" ? "#c1121f" : "#f7b801"
    }));
    const blockEvents = (cal.blocks ?? []).map((blk: any) => ({
      id: `blk:${blk.id}`,
      start: blk.startDate,
      end: blk.endDate,
      display: "background" as const,
      backgroundColor: "rgba(225, 29, 72, 0.35)",
      classNames: ["sdg-block-bg"]
    }));
    return [...bookingEvents, ...blockEvents];
  }, [cal]);

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
            <input className="sdg-input" type="date" value={spValidFrom} onChange={(e) => setSpValidFrom(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Au (dernière nuit incluse)</label>
            <input className="sdg-input" type="date" value={spValidTo} onChange={(e) => setSpValidTo(e.target.value)} />
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
                        <button type="button" className="sdg-btn-soft !px-2 !py-1 text-[11px]" onClick={() => startEditStayPromo(r)}>
                          Modifier
                        </button>
                        <button type="button" className="sdg-btn-danger !px-2 !py-1 text-[11px]" onClick={() => void deleteStayPromo(r.id)}>
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
            Clic : ajouter / retirer un jour · Glisser (clic maintenu) : ajouter toute la plage à la sélection · Double-clic : détail du jour.
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
                    <div className="rounded-md bg-sun-100 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-900">
                      {(priceCents / 100).toFixed(0)}€
                    </div>
                  ) : null}

                  {typeof promoPercent === "number" && promoPercent > 0 ? (
                    <div className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-900">
                      -{promoPercent}%{promoLabel ? ` ${promoLabel}` : ""}
                    </div>
                  ) : null}

                  {who ? (
                    <div className="max-w-full truncate text-[10px] font-bold text-slate-700" title={who}>
                      {who}
                    </div>
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
              <div className="mt-1 text-[11px] leading-snug text-slate-500">
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
                {dayWho ? <div className="mt-1 text-sm font-semibold text-slate-800">Réservé par: {dayWho}</div> : null}
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <input className="sdg-input sm:max-w-[420px]" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Raison (si blocage)" />
                <button className={dayBlocked ? "sdg-btn-soft" : "sdg-btn-danger"} onClick={() => void toggleDayBlock()}>
                  {dayBlocked ? "Débloquer ce jour" : "Bloquer ce jour"}
                </button>
              </div>
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
          <div className="text-sm font-extrabold tracking-tight text-slate-900">Demandes / réservations</div>
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
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer border-b border-slate-200/60 last:border-b-0 hover:bg-white/30"
                  onDoubleClick={() => void openBookingModal(b.id)}
                  title="Double-clic pour voir le détail"
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
                      <button className="sdg-btn-primary" onClick={() => void setStatus(b.id, "CONFIRMED")}>
                        Confirmer
                      </button>
                      <button className="sdg-btn-soft" onClick={() => void setStatus(b.id, "PENDING")}>
                        En attente
                      </button>
                      <button className="sdg-btn-danger" onClick={() => void setStatus(b.id, "CANCELLED")}>
                        Annuler
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-600">
                    Aucune réservation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
              <button className="sdg-btn-soft self-end sm:self-auto" onClick={() => setBookingModalId(null)}>
                Fermer
              </button>
            </div>

            {bookingLoading ? (
              <div className="mt-4 text-sm font-semibold text-slate-700">Chargement…</div>
            ) : bookingModalData ? (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white/60 p-4">
                  <div className="text-sm font-extrabold text-slate-900">Client</div>
                  <div className="mt-2 text-sm text-slate-800">
                    <div className="font-semibold">{bookingModalData.booking.user?.profileName ?? "-"}</div>
                    <div>{bookingModalData.booking.user?.email ?? "-"}</div>
                    <div>{bookingModalData.booking.user?.phone ?? "-"}</div>
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

