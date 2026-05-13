// Mobile-first + sécurité: pas de secret côté front.
// On utilise un chemin relatif + proxy Vite en dev (`/api` -> backend).
export const API_BASE = "";
const API_PREFIX = "/api";

export type ApiError = { error: string; issues?: Array<{ path?: Array<string | number>; message?: string }> };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    credentials: "include"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data as ApiError;
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),
  publicPing: () => request<{ ok: boolean }>("/public/ping", { method: "POST" }),

  me: () => request<{ id: string; email: string; role: "ADMIN" | "CLIENT"; profileName?: string; phone?: string }>("/me"),
  login: (email: string, password: string) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  register: (payload: { email: string; password: string; profileName?: string; phone?: string }) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),

  publicSettings: () => request("/public/settings"),
  publicAncillaryFees: () => request<Array<{ id: string; label: string; priceCents: number }>>("/public/ancillary-fees"),
  publicPortfolio: () => request("/public/portfolio"),
  publicStayPromoRules: () =>
    request<Array<{ id: string; validFrom: string; validToInclusive: string; minStayNights: number; promoPercent: number; label?: string | null }>>(
      "/public/stay-promo-rules"
    ),
  publicBookingPricingPreview: (payload: { startDate: string; endDate: string }) =>
    request<{
      nightsCount: number;
      startKey: string;
      endKey: string;
      totalBeforePromoCents: number;
      totalPromoCents: number;
      totalAfterDayPromosCents: number;
      stayPromo: {
        label: string | null;
        promoPercent: number;
        promoCents: number;
      } | null;
      totalStayPromoCents: number;
      totalCents: number;
      nights: Array<{
        day: string;
        priceCents: number;
        promoPercent: number | null;
        promoLabel: string | null;
        promoCents: number;
        missingConfig: boolean;
      }>;
      ancillaryFees: Array<{ id: string; label: string; priceCents: number }>;
      ancillaryTotalCents: number;
      grandTotalCents: number;
    }>("/public/booking-pricing-preview", { method: "POST", body: JSON.stringify(payload) }),
  publicBookingRequest: (payload: { startDate: string; endDate: string; name?: string; email?: string; phone?: string; notes?: string; equipment?: string }) =>
    request("/public/booking-request", { method: "POST", body: JSON.stringify(payload) }),
  publicCalendar: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return request<{ bookings: any[]; blocks: any[]; dayConfigs: any[] }>(`/public/calendar${qs ? `?${qs}` : ""}`);
  },

  createBooking: (payload: { startDate: string; endDate: string; notes?: string; equipment?: string }) =>
    request("/bookings", { method: "POST", body: JSON.stringify(payload) }),
  myBookings: () => request("/bookings/me"),

  adminBookings: () => request("/admin/bookings"),
  adminBookingDetail: (id: string) => request(`/admin/bookings/${id}`),
  adminSetBookingStatus: (id: string, status: "PENDING" | "CONFIRMED" | "CANCELLED") =>
    request(`/admin/bookings/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  adminCreateBlock: (payload: { startDate: string; endDate: string; reason?: string }) =>
    request("/admin/blocks", { method: "POST", body: JSON.stringify(payload) }),
  adminDeleteBlock: (id: string) => request(`/admin/blocks/${id}`, { method: "DELETE" }),
  adminClearBlocks: (payload: { startDate: string; endDate: string }) =>
    request("/admin/blocks/clear", { method: "POST", body: JSON.stringify(payload) }),
  adminUnblockDay: (day: string) => request("/admin/blocks/unblock-day", { method: "POST", body: JSON.stringify({ day }) }),
  adminUpsertDayConfig: (payload: { from: string; to: string; priceCents: number; arrivalAllowed?: boolean; departureAllowed?: boolean; promoPercent?: number | null; promoLabel?: string | null }) =>
    request("/admin/day-config", { method: "PUT", body: JSON.stringify(payload) }),

  adminStayPromoRules: () => request<any[]>("/admin/stay-promo-rules"),
  adminCreateStayPromoRule: (payload: {
    validFrom: string;
    validToInclusive: string;
    minStayNights: number;
    promoPercent: number;
    label?: string | null;
    active?: boolean;
  }) => request("/admin/stay-promo-rules", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateStayPromoRule: (
    id: string,
    payload: Partial<{
      validFrom: string;
      validToInclusive: string;
      minStayNights: number;
      promoPercent: number;
      label: string | null;
      active: boolean;
    }>
  ) => request(`/admin/stay-promo-rules/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminDeleteStayPromoRule: (id: string) => request(`/admin/stay-promo-rules/${id}`, { method: "DELETE" }),

  adminPortfolio: () => request("/admin/portfolio"),
  adminUploadPortfolio: (payload: { title?: string; type: "image" | "video"; filename: string; contentType: string; isPublished?: boolean }) =>
    request<{ media: any; uploadUrl: string }>("/admin/portfolio/upload", { method: "POST", body: JSON.stringify(payload) }),
  adminGenerateThumbnail: (id: string) => request(`/admin/portfolio/${id}/thumbnail`, { method: "POST" }),
  adminUpdateMedia: (id: string, payload: { title?: string; publicUrl?: string | null; order?: number; isPublished?: boolean }) =>
    request(`/admin/portfolio/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminDeleteMedia: (id: string) => request(`/admin/portfolio/${id}`, { method: "DELETE" }),

  adminGetSettings: () => request("/admin/settings"),
  adminSaveSettings: (payload: any) => request("/admin/settings", { method: "PUT", body: JSON.stringify(payload) }),

  adminAncillaryFees: () =>
    request<Array<{ id: string; label: string; priceCents: number; sortOrder: number; active: boolean; createdAt: string; updatedAt: string }>>(
      "/admin/ancillary-fees"
    ),
  adminCreateAncillaryFee: (payload: { label: string; priceCents: number; active?: boolean; sortOrder?: number }) =>
    request("/admin/ancillary-fees", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateAncillaryFee: (
    id: string,
    payload: Partial<{ label: string; priceCents: number; active: boolean; sortOrder: number }>
  ) => request(`/admin/ancillary-fees/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminDeleteAncillaryFee: (id: string) => request(`/admin/ancillary-fees/${id}`, { method: "DELETE" }),

  adminAccessLogs: (take?: number) => request(`/admin/access-logs${take ? `?take=${take}` : ""}`),

  chatConversation: () => request("/chat/conversation"),
  chatAdminUnread: () => request<{ count: number }>("/chat/admin-unread"),
  chatMessages: (conversationId: string) => request(`/chat/messages/${conversationId}`),
  chatSend: (conversationId: string, body: string) => request(`/chat/messages/${conversationId}`, { method: "POST", body: JSON.stringify({ body }) })
};

