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
  uploadDetail(id: string) {
    return request<{
      upload: { id: string; filename: string; columns: string[]; row_count: number; uploaded_at: string };
      rows: { row_number: number; data: Record<string, string> }[];
      items: (InventoryItem & { rowNumber: number })[];
    }>(`/api/dashboard/uploads/${id}?pageSize=500`);
  },
  getOrgProfile() {
    return request<OrgProfile>("/api/org/profile");
  },
  updateOrgProfile(patch: { address?: string; primaryContact?: string; timezone?: string }) {
    return request<OrgProfile["organization"]>("/api/org/profile", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  searchFoodBank(query: string) {
    return request<FoodBankCandidate[]>("/api/org/food-bank-search", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  },
  linkFoodBank(slug: string) {
    return request<OrgProfile>("/api/org/food-bank-link", {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
  },
  listMembers() {
    return request<OrgMember[]>("/api/org/members");
  },
  listInvites() {
    return request<OrgInvite[]>("/api/org/invites");
  },
  createInvite(email: string, role: "admin" | "staff") {
    return request<OrgInvite>("/api/org/invites", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  },
  revokeInvite(id: string) {
    return request<void>(`/api/org/invites/${id}`, { method: "DELETE" });
  },
  getInviteByToken(token: string) {
    return request<InviteLookup>(`/api/org/invites/${token}`);
  },
  acceptInvite(token: string, input: { firstName: string; lastName: string; password: string }) {
    return request<{ token: string; user: ApiUser }>(`/api/org/invites/${token}/accept`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  operationsDashboard() {
    return request<OperationsDashboard>("/api/operations/dashboard");
  },
  operationsExceptions() {
    return request<ReconciliationException[]>("/api/operations/exceptions");
  },
  updateException(
    id: string,
    input: { action: "assign" | "resolve" | "not_applicable"; assignedOwner?: string; resolutionNote?: string }
  ) {
    return request<ReconciliationException>(`/api/operations/exceptions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  generateReport(templateId: string, input: { periodStart?: string; periodEnd?: string; forceIncomplete?: boolean } = {}) {
    return request<GenerateReportResult>(`/api/operations/reports/${templateId}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listGeneratedReports() {
    return request<GeneratedReportRow[]>("/api/operations/reports");
  },
  async downloadReport(reportId: string, filename: string) {
    const token = getToken();
    const res = await fetch(`${API_BASE_URL}/api/operations/reports/${reportId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  listDistributionEvents() {
    return request<DistributionEvent[]>("/api/operations/distribution-events");
  },
  createDistributionEvent(input: CreateDistributionEventInput) {
    return request<DistributionEvent>("/api/operations/distribution-events", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listInventoryTransactions() {
    return request<InventoryTransaction[]>("/api/operations/inventory-transactions");
  },
  createInventoryTransaction(input: CreateInventoryTransactionInput) {
    return request<InventoryTransaction>("/api/operations/inventory-transactions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listVolunteerShifts() {
    return request<VolunteerShift[]>("/api/operations/volunteer-shifts");
  },
  createVolunteerShift(input: CreateVolunteerShiftInput) {
    return request<VolunteerShift>("/api/operations/volunteer-shifts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};

export interface OperationsRecommendation {
  rank: 1 | 2 | 3;
  priority: "Critical" | "High" | "Medium";
  recommendationType: string;
  title: string;
  recommendedAction: string;
  ownerRole: string;
  dueBy: string | null;
  whyNow: string;
  evidence: { description: string; sourceReferences: string[] }[];
  estimatedImpact: string;
  confidence: "High" | "Medium" | "Low";
  confidenceRationale: string;
  assumptionsAndLimits: string[];
  suggestedFollowUpQuestion: string;
}

export interface ReconciliationException {
  exceptionId: string;
  siteId: string | null;
  exceptionType: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "new" | "assigned" | "in_review" | "resolved" | "not_applicable";
  affectedQuantity: number | null;
  unitOfMeasure: string | null;
  detectedAt: string;
  sourceReferences: string[] | null;
  explanation: string;
  likelyCauses: string[] | null;
  assignedOwner: string | null;
  resolutionNote: string | null;
}

export interface OperationsDashboard {
  asOf: string;
  dataStatus: "reconciled" | "partially_reconciled" | "unreconciled" | "insufficient_data";
  readiness: { status: "green" | "yellow" | "red" | "unknown"; explanation: string };
  metrics: {
    totalItems: number;
    totalInventoryLots: number;
    unresolvedExceptionCount: number;
    exceptionSeverityCounts: Record<string, number>;
    dataFreshnessAgeMinutes: number | null;
  };
  nearExpiry: { lotId: string; itemId: string; quantityOnHand: number; unit: string; daysToExpiry: number }[];
  exceptions: ReconciliationException[];
  topThreeRecommendations: OperationsRecommendation[];
  syncedUploads: number;
}

export interface GeneratedReportRow {
  reportId: string;
  templateId: string;
  version: number;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  filename: string;
  blocked: boolean;
  generatedAt: string;
}

export interface DataQualityIssue {
  severity: "blocking" | "warning" | "informational";
  message: string;
}

export type GenerateReportResult =
  | { status: "blocked"; message: string; dataQuality: { hasBlockingIssues: boolean; issues: DataQualityIssue[] } }
  | {
      status: "generated";
      report: GeneratedReportRow;
      dataQuality: { hasBlockingIssues: boolean; issues: DataQualityIssue[] };
      downloadUrl: string;
    };

export interface DistributionLine {
  distributionLineId: string;
  distributionEventId: string;
  itemId: string;
  inventoryLotId: string | null;
  quantityPlanned: number | null;
  quantityDistributed: number | null;
  quantityReturned: number | null;
  quantityWasted: number | null;
  unitOfMeasure: string;
  weightLbs: number | null;
  sourceReference: string | null;
  reconciliationStatus: string;
}

export interface DistributionEvent {
  distributionEventId: string;
  organizationId: string;
  siteId: string;
  programId: string | null;
  distributionDate: string;
  startTime: string | null;
  endTime: string | null;
  plannedHouseholds: number | null;
  actualHouseholdsServed: number | null;
  plannedBoxes: number | null;
  actualBoxesDistributed: number | null;
  plannedVolunteers: number | null;
  confirmedVolunteers: number | null;
  eventStatus: "planned" | "in_progress" | "completed" | "cancelled";
  sourceReference: string | null;
  reconciliationStatus: string;
  lines: DistributionLine[];
}

export interface CreateDistributionEventInput {
  siteName?: string;
  programName?: string;
  distributionDate: string;
  startTime?: string;
  endTime?: string;
  plannedHouseholds?: number;
  plannedBoxes?: number;
  plannedVolunteers?: number;
  lines?: { itemName: string; unit?: string; quantityPlanned?: number }[];
}

export interface InventoryTransaction {
  transactionId: string;
  transactionType: string;
  transactionDate: string;
  itemId: string;
  inventoryLotId: string | null;
  siteId: string;
  programId: string | null;
  quantity: number;
  unitOfMeasure: string;
  weightLbs: number | null;
  sourceType: string | null;
  sourceReference: string | null;
  importedAt: string;
  reconciliationStatus: string;
  createdBy: string | null;
  notes: string | null;
}

export const INVENTORY_TRANSACTION_TYPES = [
  "opening_balance", "receipt", "adjustment", "reservation",
  "transfer_out", "transfer_in", "distribution", "waste",
  "spoilage", "donation_return", "correction",
] as const;

export interface CreateInventoryTransactionInput {
  transactionType: (typeof INVENTORY_TRANSACTION_TYPES)[number];
  itemName: string;
  unit?: string;
  quantity: number;
  transactionDate: string;
  siteName?: string;
  programName?: string;
  weightLbs?: number;
  notes?: string;
}

export interface VolunteerShift {
  shiftId: string;
  siteId: string;
  programId: string | null;
  shiftStart: string;
  shiftEnd: string;
  role: string | null;
  requiredCount: number | null;
  confirmedCount: number | null;
  checkedInCount: number | null;
  sourceReference: string | null;
}

export interface CreateVolunteerShiftInput {
  siteName?: string;
  programName?: string;
  shiftStart: string;
  shiftEnd: string;
  role?: string;
  requiredCount?: number;
  confirmedCount?: number;
  checkedInCount?: number;
}

export interface OrgProfile {
  organization: {
    organizationId: string;
    organizationName: string;
    organizationType: string | null;
    timezone: string;
    address: string | null;
    reportingCurrency: string;
    primaryContact: string | null;
    activeStatus: boolean;
  };
  profileSetupCompleted: boolean;
  feedingAmerica: {
    slug: string;
    name: string;
    website: string | null;
    phone: string | null;
    mealsProvided: number | null;
    poundsDistributed: number | null;
    countiesServed: string[];
  } | null;
}

export interface FoodBankCandidate {
  name: string;
  slug: string;
  profile_url?: string;
  website?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  address?: string;
  counties_served?: string[];
  matchReason: string;
}

export interface OrgMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "staff";
  createdAt: string;
}

export interface OrgInvite {
  id: string;
  email: string;
  role: "admin" | "staff";
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface InviteLookup {
  id: string;
  foodBankId: string;
  foodBankName: string;
  email: string;
  role: "admin" | "staff";
}
