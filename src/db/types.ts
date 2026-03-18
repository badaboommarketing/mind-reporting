import {
  AppStore,
  ManualImportBatch,
  MetricKey,
  MetricStatus,
  MissionControlSummary,
  PerformanceReport,
  PerformanceReportKey,
  ReviewException,
  ScorecardReport,
  UploadType,
  User,
} from "../domain/model.js";

export interface AuthenticatedUser extends User {
  memberships: Array<{
    clientId: string;
    role: "agency_admin" | "client_editor" | "client_viewer";
  }>;
}

export interface ServiceHealthcheck {
  ok: boolean;
  mode: "demo" | "database";
  now: string;
  checks: {
    database: {
      ok: boolean;
      status: "ok" | "skipped" | "error";
      latencyMs?: number;
      error?: string;
    };
  };
}

export interface CreateClientInput {
  name: string;
  reportingTimezone: string;
  reportingCurrency: string;
  spendBasis: "gross" | "net";
  leadDefinition: string;
  newClientDefinition: string;
  pipelineMappingNotes: string;
  bookingMappingNotes: string;
  revenueMappingNotes: string;
  duplicateRules: string[];
  manualImportSources: string[];
  defaultOwnerUserId: string | null;
  metricTargets: Partial<Record<MetricKey, number>>;
  sourcePriorityByMetric: Partial<Record<MetricKey, string>>;
}

export interface UploadCsvInput {
  clientId: string;
  uploadType: UploadType;
  fileName: string;
  uploadedBy: string;
  csvText: string;
}

export interface LiveAppService {
  mode: "demo" | "database";
  healthcheck(): Promise<ServiceHealthcheck>;
  getCurrentUser(userId: string): Promise<AuthenticatedUser | null>;
  getUserByEmail(email: string): Promise<AuthenticatedUser | null>;
  upsertGoogleUser(input: {
    email: string;
    name: string;
    googleSubject: string;
    avatarUrl?: string | null;
  }): Promise<AuthenticatedUser>;
  listVisibleClients(userId: string): Promise<AppStore["clients"]>;
  getMissionControl(userId: string): Promise<MissionControlSummary>;
  getScorecard(userId: string, clientId: string, reportMonth: string): Promise<ScorecardReport>;
  getPerformanceReport(
    userId: string,
    clientId: string,
    reportMonth: string,
    reportKey: PerformanceReportKey,
  ): Promise<PerformanceReport>;
  listClientUsers(userId: string, clientId: string): Promise<User[]>;
  listUploadBatches(userId: string, clientId: string): Promise<ManualImportBatch[]>;
  listExceptions(
    userId: string,
    clientId: string,
    reportMonth: string | null,
  ): Promise<ReviewException[]>;
  createClient(userId: string, input: CreateClientInput): Promise<{ clientId: string }>;
  addAnnotation(
    userId: string,
    input: {
      clientId: string;
      reportMonth: string;
      metricKey: MetricKey;
      status: MetricStatus;
      ownerUserId: string | null;
      sourceNote: string | null;
      riskNote: string | null;
      manualOverrideValue: number | null;
      overrideReason: string | null;
    },
  ): Promise<void>;
  uploadCsv(userId: string, input: UploadCsvInput): Promise<{ batchId: string; createdFacts: number }>;
  resolveException(
    userId: string,
    input: { exceptionId: string; status: ReviewException["status"] },
  ): Promise<void>;
  lockReport(
    userId: string,
    input: { clientId: string; reportMonth: string },
  ): Promise<void>;
  unlockReport(
    userId: string,
    input: { clientId: string; reportMonth: string },
  ): Promise<void>;
}
