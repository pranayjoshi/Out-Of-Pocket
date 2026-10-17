export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = "relay-session";

export function sessionToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveSession(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = options.token === undefined ? sessionToken() : options.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "offline", "Relay can’t reach the marketplace right now. You can retry when the connection returns.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.code || "error", data.error || "That request didn’t go through.");
  return data as T;
}

export function money(cents: number) {
  if (!cents) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export type User = {
  id: string;
  displayName: string;
  initials: string;
  bio: string;
  email?: string;
  campus: string;
  browseCampus?: string;
  role?: string;
  campusVerification: { badge: string; proves: string } | null;
  joinedAt: string;
  completedExchanges: number;
  activeListings: number;
  responseTimeHours: number | null;
  preferences?: { emailEnabled: boolean; pushEnabled: boolean; quietStart: string | null; quietEnd: string | null; timezone: string; metricsConsent: boolean };
};

export type Listing = {
  id: string;
  title: string;
  description: string;
  category: string;
  condition: string;
  priceCents: number;
  originalPriceCents: number | null;
  status: string;
  listingType: string;
  campus: string;
  area: string | null;
  crossCampus: boolean;
  categoryDetails: Record<string, string | number>;
  checks: string[];
  version: number;
  source: string;
  saved: boolean;
  mine?: boolean;
  seller: User;
  photos: { id: string; url: string; thumbUrl: string; cover: boolean }[];
  fulfillment: { method: string; maxMiles?: number | null; feeCents: number; transportNotes: string };
};

export type Reservation = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: string;
  priceCents: number;
  feeCents: number;
  totalCents: number;
  fulfillment: string;
  snapshot: { title: string; checks: string[]; description: string; priceCents: number };
  identified: boolean;
  pickup: { startsAt: string; timezone: string; placeLabel: string; status: string; proposedBy: string } | null;
  payment: { id: string; status: string; amountCents: number; captureDeadline: string | null; note: string; sandbox: boolean } | null;
  cancelReason: string | null;
};
