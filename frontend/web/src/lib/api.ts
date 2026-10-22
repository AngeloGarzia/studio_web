// Mobile-first + sécurité: pas de secret côté front.
// Dev: chemin relatif + proxy Vite (`/api` -> backend).
// Prod (front/back séparés): définir VITE_API_URL = origine de l’API, sans slash final.
import type { AppRole } from "./roles";

function normalizeApiOrigin(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

export const API_BASE = normalizeApiOrigin(import.meta.env.VITE_API_URL);
const API_PREFIX = "/api";

/** Chemin API absolu ou relatif (images, liens). */
export function apiUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${suffix.startsWith("/api") ? suffix : `${API_PREFIX}${suffix}`}`;
}

/** URL média (chemin `/api/...` de l’API, ou URL absolue S3). */
export function mediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) return path;
  if (path.startsWith("/")) return `${API_BASE}${path}`;
  return path;
}

export type ApiError = { error: string; issues?: Array<{ path?: Array<string | number>; message?: string }> };

export type DirectoryAccount = {
  id: string;
  email: string;
  profileName: string;
  phone: string;
  role: AppRole;
  isGuest?: boolean;
};

export type DirectoryOwner = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  isCompany: boolean;
  companyName: string;
  establishments: Array<{ id: string; name: string }>;
  hasSignature: boolean;
  user: Omit<DirectoryAccount, "isGuest"> | null;
};

export type DirectoryTenant = {
  id: string;
  establishmentId: string;
  establishmentName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  formerAddress: string;
  visaNumber: string;
  nationality: string;
  birthDate: string;
  leaseStart: string;
  user: Omit<DirectoryAccount, "isGuest"> | null;
};

export type DirectoryPayload = {
  owners: DirectoryOwner[];
  tenants: DirectoryTenant[];
  users: DirectoryAccount[];
  establishments: Array<{ id: string; name: string }>;
  mail?: { ok: true; to: string } | { ok: false; error: string };
};

type DirectoryAccountInput = { email: string; profileName: string; phone: string; role: AppRole; password: string };

export type DirectoryOwnerPayload = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  isCompany: boolean;
  companyName: string;
  userId: string;
  account: DirectoryAccountInput | null;
};

export type DirectoryTenantPayload = Omit<DirectoryOwnerPayload, "address" | "isCompany" | "companyName"> & {
  establishmentId: string;
  formerAddress: string;
  visaNumber: string;
  nationality: string;
  birthDate: string;
  leaseStart: string;
};

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    credentials: "include"
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw data as ApiError;
  }
  return res.blob();
}

async function postForm<T>(path: string, payload: unknown, files: File[]): Promise<T> {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  for (const file of files) form.append("attachments", file, file.name);
  const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, { method: "POST", body: form, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data as ApiError;
  return data as T;
}

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

  me: () => request<{ id: string; email: string; role: AppRole; profileName?: string; phone?: string }>("/me"),
  login: (email: string, password: string) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  setupPassword: (token: string, password: string) =>
    request("/auth/setup-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  register: (payload: { email: string; password: string; profileName?: string; phone?: string }) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),

  publicSettings: () => request("/public/settings"),
  publicEstablishments: () =>
    request<
      Array<{
        id: string;
        name: string;
        rentalKind: "FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY";
        summary: string;
        city: string;
        coverUrl: string | null;
      }>
    >("/public/establishments"),
  publicVisit: () => request<{ establishmentId: string | null }>("/public/visit"),
  choosePublicEstablishment: (id: string) =>
    request<{ ok: true; establishmentId: string }>(`/public/establishments/${id}/choose`, { method: "POST" }),
  clearPublicEstablishment: () => request<{ ok: true }>("/public/establishments/choice", { method: "DELETE" }),
  adminEstablishmentImages: (id: string) =>
    request<Array<{ id: string; title: string | null; thumbUrl: string }>>(`/admin/establishments/${id}/images`),
  publicAncillaryFees: () => request<Array<{ id: string; label: string; priceCents: number }>>("/public/ancillary-fees"),
  publicPortfolio: () =>
    request<
      Array<{
        id: string;
        title?: string | null;
        type: string;
        url?: string | null;
        thumbUrl?: string | null;
        publicUrl?: string | null;
        order?: number;
        isPublished?: boolean;
      }>
    >("/public/portfolio"),
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
    return request<{
      bookings: Array<{ startDate: string; endDate: string }>;
      blocks: Array<{ startDate: string; endDate: string }>;
      dayConfigs: Array<{
        date: string;
        priceCents: number;
        arrivalAllowed?: boolean;
        departureAllowed?: boolean;
        promoPercent?: number | null;
        promoLabel?: string | null;
      }>;
    }>(`/public/calendar${qs ? `?${qs}` : ""}`);
  },

  createBooking: (payload: { startDate: string; endDate: string; notes?: string; equipment?: string }) =>
    request("/bookings", { method: "POST", body: JSON.stringify(payload) }),
  myBookings: () => request("/bookings/me"),

  adminBookings: () => request("/admin/bookings"),
  adminClients: () =>
    request<
      Array<{
        id: string;
        email: string;
        profileName: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
        residenceAddress: string | null;
      }>
    >("/admin/clients"),
  adminUpdateBooking: (id: string, payload: {
    startDate: string;
    endDate: string;
    notes?: string;
    platform?: string | null;
    residenceAddress?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) => request<{ ok: true }>(`/admin/bookings/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminCreateBooking: (payload: {
    startDate: string;
    endDate: string;
    notes?: string;
    platform?: string;
    residenceAddress?: string;
    firstName?: string;
    lastName?: string;
    clientId?: string;
    client?: { firstName: string; lastName: string; email: string; phone: string };
  }) => request<{ booking: { id: string }; clientCreated: boolean }>("/admin/bookings", { method: "POST", body: JSON.stringify(payload) }),
  adminUploadBookingPlatformImage: async (id: string, file: File) => {
    const res = await fetch(`${API_BASE}${API_PREFIX}/admin/bookings/${id}/platform-image`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw data as ApiError;
    return data as { ok: true };
  },
  adminDeleteBooking: (id: string) => request<{ ok: true }>(`/admin/bookings/${id}`, { method: "DELETE" }),
  adminBookingDetail: (id: string) => request(`/admin/bookings/${id}`),
  adminSetBookingStatus: (id: string, status: "PENDING" | "CONFIRMED" | "CANCELLED") =>
    request(`/admin/bookings/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  adminSendBookingEmail: (id: string) =>
    request<{ ok: true; to: string; owners?: string[] }>(`/admin/bookings/${id}/send-email`, { method: "POST" }),
  adminProposeBooking: (id: string, payload: { proposedStart: string; proposedEnd: string; message: string }) =>
    request<{ ok: true; to: string }>(`/admin/bookings/${id}/proposal`, { method: "POST", body: JSON.stringify(payload) }),
  adminSendQuittance: (
    id: string,
    payload: {
      bailleurName: string;
      bailleurAddress: string;
      bailleurPhone: string;
      bailleurEmail: string;
      tenantName: string;
      logement: string;
      periodFrom: string;
      periodTo: string;
      rentCents: number;
      chargesCents: number;
      receivedCents: number;
      paymentDate: string;
      paymentMethod: string;
      place: string;
      issueDate: string;
      feeLines: Array<{ label: string; priceCents: number }>;
    },
    files: File[] = []
  ) => postForm<{ ok: true; to: string; owners?: string[] }>(`/admin/bookings/${id}/quittance`, payload, files),
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

  adminEstablishments: () =>
    request<
      Array<{
        id: string;
        name: string;
        rentalKind: "FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY";
        tenants: Array<{ id: string; name: string; email: string | null; phone: string | null; formerAddress: string | null }>;
        owners: Array<{
          id: string;
          firstName: string;
          lastName: string;
          email: string | null;
          phone: string | null;
          address: string | null;
          isCompany: boolean;
          companyName: string | null;
          hasSignature: boolean;
        }>;
        monthlyRentCents: number;
        monthlyChargesCents: number;
        address: string | null;
        city: string;
        studioName: string;
        description: string;
        summary: string;
        coverMediaId: string | null;
        coverUrl: string | null;
        active: boolean;
      }>
    >("/admin/establishments"),
  adminCreateEstablishment: (payload: { name: string; rentalKind: "FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY" }) =>
    request<{ id: string; name: string; rentalKind: "FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY"; active: boolean }>(
      "/admin/establishments",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  adminUpdateEstablishment: (
    id: string,
    payload: Partial<{
      name: string;
      address: string;
      city: string;
      description: string;
      coverMediaId: string | null;
      rentalKind: "FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY";
      tenantName: string | null;
      tenantEmail: string | null;
      monthlyRentCents: number;
      monthlyChargesCents: number;
    }>
  ) => request(`/admin/establishments/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminDeleteEstablishment: (id: string) => request<{ ok: true }>(`/admin/establishments/${id}`, { method: "DELETE" }),
  adminActivateEstablishment: (id: string) =>
    request<{ ok: true; id: string }>(`/admin/establishments/${id}/activate`, { method: "POST" }),
  adminCreateMonthlyTenant: (establishmentId: string, payload: { name: string; email?: string; phone?: string }) =>
    request<{ id: string; name: string; email: string | null; phone: string | null }>(`/admin/establishments/${establishmentId}/tenants`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  adminDeleteMonthlyTenant: (establishmentId: string, tenantId: string) =>
    request(`/admin/establishments/${establishmentId}/tenants/${tenantId}`, { method: "DELETE" }),
  adminTenantFile: (establishmentId: string, tenantId: string) =>
    request<{
      tenant: {
        id: string;
        name: string;
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
        formerAddress: string | null;
        visaNumber: string | null;
        nationality: string | null;
        birthDate: string;
        leaseStart: string;
      };
      months: Array<{
        month: string;
        status: "paid" | "partial" | "unpaid";
        dueCents: number;
        receivedCents: number;
        balanceCents: number;
        receiptId: string | null;
      }>;
    }>(`/admin/establishments/${establishmentId}/tenants/${tenantId}`),
  adminUpdateMonthlyTenant: (
    establishmentId: string,
    tenantId: string,
    payload: {
      firstName: string;
      lastName: string;
      formerAddress: string;
      phone: string;
      email: string;
      visaNumber: string;
      nationality: string;
      birthDate: string;
      leaseStart: string;
    }
  ) => request(`/admin/establishments/${establishmentId}/tenants/${tenantId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminResendReceipt: (establishmentId: string, tenantId: string, receiptId: string) =>
    request<{ ok: true; to: string; owners?: string[] }>(`/admin/establishments/${establishmentId}/tenants/${tenantId}/receipts/${receiptId}/send`, {
      method: "POST"
    }),
  adminDirectory: () => request<DirectoryPayload>("/admin/directory"),
  adminUpdateDirectoryOwner: (ownerId: string, payload: DirectoryOwnerPayload) =>
    request<DirectoryPayload>(`/admin/directory/owners/${ownerId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminSaveOwnerSignature: (ownerId: string, png: string) =>
    request<{ hasSignature: true }>(`/admin/directory/owners/${ownerId}/signature`, { method: "PUT", body: JSON.stringify({ png }) }),
  adminClearOwnerSignature: (ownerId: string) =>
    request<{ hasSignature: false }>(`/admin/directory/owners/${ownerId}/signature`, { method: "DELETE" }),
  adminUpdateDirectoryTenant: (tenantId: string, payload: DirectoryTenantPayload) =>
    request<DirectoryPayload>(`/admin/directory/tenants/${tenantId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminCreateDirectoryOwner: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    isCompany: boolean;
    companyName: string;
    account: { email: string; profileName: string; phone: string; role: AppRole; password: string } | null;
  }) => request<DirectoryPayload>("/admin/directory/owners", { method: "POST", body: JSON.stringify(payload) }),
  adminCreateDirectoryTenant: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    establishmentId: string;
    leaseStart: string;
    account: { email: string; profileName: string; phone: string; role: AppRole; password: string } | null;
  }) => request<DirectoryPayload>("/admin/directory/tenants", { method: "POST", body: JSON.stringify(payload) }),
  adminCreateDirectoryAccount: (
    kind: "owners" | "tenants",
    id: string,
    payload: { email: string; profileName: string; phone: string; role: AppRole; password: string }
  ) => request<DirectoryPayload>(`/admin/directory/${kind}/${id}/account`, { method: "POST", body: JSON.stringify(payload) }),
  adminSendDirectoryConfirmation: (kind: "owners" | "tenants", id: string, password: string) =>
    request<{ ok: true; to: string }>(`/admin/directory/${kind}/${id}/confirmation`, {
      method: "POST",
      body: JSON.stringify({ password })
    }),
  adminOwners: () =>
    request<
      Array<{
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
        establishments: Array<{ id: string; name: string }>;
      }>
    >("/admin/owners"),
  adminCreateOwner: (payload: { firstName: string; lastName: string; email?: string; phone?: string }) =>
    request<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null }>("/admin/owners", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  adminUpdateOwner: (ownerId: string, payload: { firstName: string; lastName: string; email: string; phone: string }) =>
    request(`/admin/owners/${ownerId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminDeleteOwner: (ownerId: string) => request(`/admin/owners/${ownerId}`, { method: "DELETE" }),
  adminAttachOwner: (establishmentId: string, ownerId: string) =>
    request(`/admin/establishments/${establishmentId}/owners`, { method: "POST", body: JSON.stringify({ ownerId }) }),
  adminDetachOwner: (establishmentId: string, ownerId: string) =>
    request(`/admin/establishments/${establishmentId}/owners/${ownerId}`, { method: "DELETE" }),
  adminPreviewMonthlyQuittance: (payload: {
    establishmentId?: string;
    tenantId: string;
    tenantEmail: string;
    bailleurName: string;
    bailleurAddress: string;
    bailleurPhone: string;
    bailleurEmail: string;
    tenantName: string;
    logement: string;
    periodFrom: string;
    periodTo: string;
    rentCents: number;
    chargesCents: number;
    receivedCents: number;
    paymentDate: string;
    paymentMethod: string;
    place: string;
    issueDate: string;
    feeLines: Array<{ label: string; priceCents: number }>;
    splitByTenant?: boolean;
    occupants?: Array<{
      tenantId: string;
      tenantName: string;
      tenantEmail: string;
      phone?: string;
      rentCents?: number;
      chargesCents?: number;
      receivedCents?: number;
    }>;
  }) => requestBlob("/admin/establishments/monthly-quittance/preview", { method: "POST", body: JSON.stringify(payload) }),
  adminSendMonthlyQuittance: (payload: {
    establishmentId?: string;
    tenantId: string;
    tenantEmail: string;
    bailleurName: string;
    bailleurAddress: string;
    bailleurPhone: string;
    bailleurEmail: string;
    tenantName: string;
    logement: string;
    periodFrom: string;
    periodTo: string;
    rentCents: number;
    chargesCents: number;
    receivedCents: number;
    paymentDate: string;
    paymentMethod: string;
    place: string;
    issueDate: string;
    feeLines: Array<{ label: string; priceCents: number }>;
    splitByTenant?: boolean;
    occupants?: Array<{
      tenantId: string;
      tenantName: string;
      tenantEmail: string;
      phone?: string;
      rentCents?: number;
      chargesCents?: number;
      receivedCents?: number;
    }>;
  }, files: File[] = []) => postForm<{ ok: true; to: string; owners?: string[] }>("/admin/establishments/monthly-quittance", payload, files),

  chatConversation: () => request("/chat/conversation"),
  chatAdminUnread: () => request<{ count: number }>("/chat/admin-unread"),
  chatMessages: (conversationId: string) => request(`/chat/messages/${conversationId}`),
  chatSend: (conversationId: string, body: string) => request(`/chat/messages/${conversationId}`, { method: "POST", body: JSON.stringify({ body }) })
};

