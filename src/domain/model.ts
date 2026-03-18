export type UserRole = "agency_admin" | "client_editor" | "client_viewer";

export type SourcePlatform =
  | "meta_ads"
  | "gohighlevel"
  | "close"
  | "manual_import";

export type CredentialStatus =
  | "healthy"
  | "expired"
  | "invalid"
  | "needs_refresh";

export type ConnectorHealth =
  | "healthy"
  | "stale"
  | "partial"
  | "manual"
  | "conflicted"
  | "broken";

export type SyncMode = "rolling_window" | "full_refresh" | "manual_only";

export type SpendBasis = "gross" | "net";

export type WeekBucket =
  | "1-7"
  | "8-14"
  | "15-21"
  | "22-28"
  | "29-EOM";

export type ScorecardSection =
  | "most_important_number"
  | "book_a_demo_call"
  | "ad_performance";

export type MetricStatus =
  | "select_status"
  | "yellow"
  | "green"
  | "red"
  | "light_green"
  | "light_red";

export type ExceptionType =
  | "unmatched_identity"
  | "conflicting_source_totals"
  | "stale_connector"
  | "expired_credentials"
  | "missing_mapping"
  | "manual_import_conflict"
  | "post_lock_drift";

export type ExceptionStatus =
  | "open"
  | "dismissed"
  | "resolved_by_override"
  | "resolved_by_mapping_change"
  | "reopened";

export type ValueKind = "count" | "currency" | "ratio";

export type FactType =
  | "ad_spend"
  | "impressions"
  | "link_clicks"
  | "lead"
  | "strategy_call"
  | "triage_call"
  | "new_client"
  | "revenue_booked"
  | "revenue_collected";

export type MetricKey =
  | "new_clients"
  | "cost_per_new_client"
  | "strategy_calls"
  | "cost_per_strategy_call"
  | "triage_calls"
  | "cost_per_triage_call"
  | "leads"
  | "cost_per_lead"
  | "total_spend"
  | "new_revenue_collected"
  | "new_revenue_booked"
  | "contribution_margin_collected"
  | "contribution_margin_booked"
  | "weekly_roas"
  | "monthly_roas"
  | "impressions"
  | "link_clicks"
  | "ctr"
  | "cpm"
  | "calls"
  | "cost_per_call";

export type PerformanceReportKey =
  | "meta_delivery"
  | "meta_funnel"
  | "meta_revenue";

export interface User {
  id: string;
  name: string;
  email: string;
  googleSubject?: string | null;
  isPlatformAdmin?: boolean;
}

export interface ClientMembership {
  clientId: string;
  userId: string;
  role: UserRole;
}

export interface MetricSourceRule {
  metricKey: MetricKey;
  sourcePriority: SourcePlatform[];
  fallbackToManualImport: boolean;
}

export interface ClientConfig {
  leadDefinition: string;
  newClientDefinition: string;
  reportingTimezone: string;
  reportingCurrency: string;
  spendBasis: SpendBasis;
  pipelineMappings: Record<string, string[]>;
  bookingMappings: Record<string, string[]>;
  revenueMappings: Record<string, string>;
  duplicateRules: string[];
  manualImportSources: string[];
  metricSourceRules: MetricSourceRule[];
}

export interface Client {
  id: string;
  name: string;
  createdAt: string;
  onboardingCompletedAt?: string | null;
  config: ClientConfig;
  metricTargets: Partial<Record<MetricKey, number>>;
  metricOwners: Partial<Record<MetricKey, string>>;
}

export interface RateLimitPolicy {
  requestsPerMinute: number;
  burstLimit: number;
  backoffBaseMs: number;
}

export interface DataSource {
  id: string;
  clientId: string;
  source: SourcePlatform;
  displayName: string;
  accountCurrency: string;
  credentialStatus: CredentialStatus;
  secretRef: string;
  expiresAt: string | null;
  lastRefreshAt: string | null;
  lastSyncedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  retryCount: number;
  expectedMaxLagMinutes: number;
  syncMode: SyncMode;
  rollingWindowDays: number;
  rateLimitPolicy: RateLimitPolicy;
  health: ConnectorHealth;
}

export interface FxRate {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  rateDate: string;
  source: string;
}

export interface FactDimensions {
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  funnelId?: string;
  funnelName?: string;
  formId?: string;
  formName?: string;
  calendarId?: string;
  calendarName?: string;
  pipelineId?: string;
  pipelineName?: string;
  stageId?: string;
  stageName?: string;
  opportunityId?: string;
  ownerId?: string;
  ownerName?: string;
  contactKey?: string;
  externalAttributionKey?: string;
  extraJson?: Record<string, unknown>;
}

export interface NormalizedFact {
  id: string;
  clientId: string;
  source: SourcePlatform;
  sourceRecordKey: string;
  factType: FactType;
  occurredAtUtc: string;
  reportingTimezone: string;
  reportingDateLocal: string;
  valueKind: ValueKind;
  value: number;
  currencyNative?: string;
  amountNative?: number;
  currencyReporting?: string;
  amountReporting?: number;
  fxRate?: number;
  fxRateDate?: string;
  dimensions: FactDimensions;
  rawSnapshotId: string;
  syncedAt: string;
  reasonCode?: string;
  importBatchId?: string;
  isDeleted?: boolean;
}

export interface RawSnapshot {
  id: string;
  clientId: string;
  source: SourcePlatform;
  sourceRecordKey: string;
  capturedAt: string;
  payload: Record<string, unknown>;
}

export interface IdentityLink {
  id: string;
  clientId: string;
  contactKey: string;
  normalizedEmailHash?: string;
  normalizedPhoneHash?: string;
  metaLeadKey?: string;
  ghlContactKey?: string;
  closeLeadKey?: string;
}

export interface ReportAnnotation {
  clientId: string;
  reportMonth: string;
  metricKey: MetricKey;
  status: MetricStatus;
  ownerUserId: string | null;
  sourceNote: string | null;
  riskNote: string | null;
  manualOverrideValue: number | null;
  overrideReason: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface PublishedMetricSnapshot {
  metricKey: MetricKey;
  value: number | null;
  status: MetricStatus;
  ownerUserId: string | null;
  sourceNote: string | null;
  riskNote: string | null;
}

export interface ReportVersion {
  id: string;
  clientId: string;
  reportMonth: string;
  lockedAt: string;
  lockedBy: string;
  versionNumber: number;
  snapshot: PublishedMetricSnapshot[];
}

export interface ReviewException {
  id: string;
  clientId: string;
  reportMonth: string | null;
  type: ExceptionType;
  status: ExceptionStatus;
  title: string;
  detail: string;
  metricKey?: MetricKey;
  relatedSource?: SourcePlatform;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceReportDefinition {
  key: PerformanceReportKey;
  label: string;
  description: string;
  grain: "ad";
  metrics: MetricKey[];
  primarySource: SourcePlatform;
}

export interface MetricValueSet {
  weeklyBuckets: Record<WeekBucket, number | null>;
  monthlyActual: number | null;
}

export interface MetricComputation {
  metricKey: MetricKey;
  label: string;
  section: ScorecardSection;
  sourceNative: Partial<Record<SourcePlatform, MetricValueSet>>;
  resolved: MetricValueSet;
  resolvedSource: SourcePlatform | "formula" | "manual_override" | null;
  varianceBySource: Partial<Record<SourcePlatform, number | null>>;
  target: number | null;
  paceProjection: number | null;
  pacePercent: number | null;
  qualityState: ConnectorHealth;
  status: MetricStatus;
  ownerUserId: string | null;
  sourceNote: string | null;
  riskNote: string | null;
  manualOverrideValue: number | null;
}

export interface ScorecardReport {
  clientId: string;
  clientName: string;
  reportMonth: string;
  reportTimezone: string;
  reportCurrency: string;
  isLocked: boolean;
  publishedVersionId: string | null;
  metrics: MetricComputation[];
  openExceptions: ReviewException[];
}

export interface PerformanceReportRow {
  dimensionKey: string;
  adId: string;
  adName: string;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  values: Partial<Record<MetricKey, number | null>>;
}

export interface PerformanceReport {
  clientId: string;
  reportMonth: string;
  definition: PerformanceReportDefinition;
  currency: string;
  rows: PerformanceReportRow[];
}

export interface MissionControlSummary {
  generatedAt: string;
  openExceptionCount: number;
  driftedLockedReportCount: number;
  brokenConnectorCount: number;
  staleConnectorCount: number;
  expiredCredentialCount: number;
  clientStatuses: Array<{
    clientId: string;
    clientName: string;
    brokenConnectors: number;
    staleConnectors: number;
    openExceptions: number;
    lockedReportsWithDrift: number;
  }>;
}

export interface AppStore {
  users: User[];
  memberships: ClientMembership[];
  clients: Client[];
  dataSources: DataSource[];
  fxRates: FxRate[];
  rawSnapshots: RawSnapshot[];
  facts: NormalizedFact[];
  identityLinks: IdentityLink[];
  annotations: ReportAnnotation[];
  reportVersions: ReportVersion[];
  exceptions: ReviewException[];
}

export type UploadType =
  | "meta_delivery"
  | "gohighlevel_funnel"
  | "close_revenue"
  | "fx_rates";

export interface ManualImportBatch {
  id: string;
  clientId: string;
  uploadType: UploadType;
  fileName: string;
  uploadedBy: string;
  rowCount: number;
  status: "pending" | "completed" | "failed";
  notes: string | null;
  createdAt: string;
}
