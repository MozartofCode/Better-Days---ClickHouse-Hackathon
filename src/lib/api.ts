// Thin client for the real backend in api/ (see api/README.md for the full contract).

import type { InventoryItem } from "./inventorySchema";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const TOKEN_KEY = "pana_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = (data && typeof data === "object" && "error" in data && typeof data.error === "string")
      ? data.error
      : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}

export interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "staff";
  foodBankId: string;
  foodBankName: string;
}

export const api = {
  register(input: { email: string; password: string; firstName: string; lastName: string; role: "admin" | "staff"; foodBankName: string }) {
    return request<{ token: string; user: ApiUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  login(input: { email: string; password: string }) {
    return request<{ token: string; user: ApiUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  me() {
    return request<{ user: ApiUser }>("/api/auth/me");
  },
  uploadFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<{
      id: string;
      filename: string;
      columns: string[];
      rowCount: number;
      matchedFields: string[];
      unmatchedFields: string[];
    }>("/api/uploads", {
      method: "POST",
      body: form,
    });
  },
  dashboardSummary() {
    return request<{
      totalUploads: number;
      totalRows: number;
      lastUploadAt: string | null;
      recentUploads: { id: string; filename: string; row_count: number; uploaded_at: string }[];
      currentInventory: {
        fromUpload: { id: string; filename: string; uploadedAt: string };
        totalItems: number;
        expiringSoon: number;
        expired: number;
        lowStock: number;
        outOfStock: number;
        categories: { name: string; count: number }[];
      } | null;
    }>("/api/dashboard/summary");
  },
  listUploads() {
    return request<{
      uploads: { id: string; filename: string; columns: string[]; row_count: number; uploaded_at: string }[];
    }>("/api/uploads");
  },
  uploadDetail(id: string) {
    return request<{
      upload: { id: string; filename: string; columns: string[]; row_count: number; uploaded_at: string };
      rows: { row_number: number; data: Record<string, string> }[];
      items: (InventoryItem & { rowNumber: number })[];
    }>(`/api/dashboard/uploads/${id}?pageSize=500`);
  },

  // --- Community/demand data ("Ask Your Data") ---
  demandUpload(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<DemandIngestSummary>("/api/demand/ingest", { method: "POST", body: form });
  },
  demandIngestJson(filename: string, records: Record<string, unknown>[]) {
    return request<DemandIngestSummary>("/api/demand/ingest-json", {
      method: "POST",
      body: JSON.stringify({ filename, records }),
    });
  },
  demandUploads() {
    return request<{ uploads: DemandUploadSummary[] }>("/api/demand/uploads");
  },
  suggestedDemandQuestions() {
    return request<{ questions: { metric: DemandMetric; question: string }[] }>("/api/demand/suggested-questions");
  },
  askDemandQuestion(question: string) {
    return request<DemandAskResult>("/api/demand/ask", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
  },
  runSuggestedDemandQuestion(metric: DemandMetric) {
    return request<DemandAskResult>(`/api/demand/ask/${metric}`, { method: "POST" });
  },
};

export type DemandMetric = "topSites" | "trend" | "commodities" | "increasing" | "momChange";

export interface DemandIngestSummary {
  uploadId: string;
  filename: string;
  source: "csv" | "xlsx" | "json" | "api";
  columns: string[];
  rowCount: number;
  normalizedCount: number;
  errorCount: number;
}

export interface DemandUploadSummary {
  id: string;
  filename: string;
  source: string;
  columns: string[];
  row_count: number;
  normalized_count: number;
  error_count: number;
  uploaded_at: string;
}

export interface DemandAskResult {
  metric: DemandMetric;
  label: string;
  data: unknown;
  answer: string;
  narratedByAi: boolean;
}
