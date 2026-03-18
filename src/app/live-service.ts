import { randomUUID } from "node:crypto";

import {
  buildMissionControl,
  getPerformanceReport,
  getScorecardReport,
  lockReport as buildLockedReport,
  unlockLatestReport,
} from "../domain/reporting.js";
import {
  AppStore,
  Client,
  ClientMembership,
  ManualImportBatch,
  MetricKey,
  MetricStatus,
  NormalizedFact,
  ReportAnnotation,
  ReportVersion,
  ReviewException,
  UploadType,
  User,
} from "../domain/model.js";
import { normalizeCurrencyFact } from "../domain/currency.js";
import { METRIC_DEFINITIONS } from "../domain/metrics.js";
import { createAppApi, createStore } from "./store.js";
import { getPool } from "../db/pool.js";
import { CreateClientInput, LiveAppService, UploadCsvInput, AuthenticatedUser } from "../db/types.js";
import { AppError } from "../lib/errors.js";
import { prepareCsvImport } from "../importers/csv.js";
import { PoolClient } from "pg";

function mapUser(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    googleSubject: row.google_subject ?? null,
    isPlatformAdmin: row.is_platform_admin ?? false,
  };
}

function mapMembership(row: any): ClientMembership {
  return {
    clientId: row.client_id,
    userId: row.user_id,
    role: row.role,
  };
}

function mapClient(row: any): Client {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    onboardingCompletedAt: row.onboarding_completed_at?.toISOString() ?? null,
    config: {
      leadDefinition: row.lead_definition,
      newClientDefinition: row.new_client_definition,
      reportingTimezone: row.reporting_timezone,
      reportingCurrency: row.reporting_currency,
      spendBasis: row.spend_basis,
      pipelineMappings: row.pipeline_mappings ?? {},
      bookingMappings: row.booking_mappings ?? {},
      revenueMappings: row.revenue_mappings ?? {},
      duplicateRules: row.duplicate_rules ?? [],
      manualImportSources: row.manual_import_sources ?? [],
      metricSourceRules: [],
    },
    metricTargets: {},
    metricOwners: {},
  };
}

function mapDataSource(row: any) {
  return {
    id: row.id,
    clientId: row.client_id,
    source: row.source,
    displayName: row.display_name,
    accountCurrency: row.account_currency,
    credentialStatus: row.credential_status,
    secretRef: row.secret_ref,
    expiresAt: row.expires_at?.toISOString() ?? null,
    lastRefreshAt: row.last_refresh_at?.toISOString() ?? null,
    lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
    lastSuccessAt: row.last_success_at?.toISOString() ?? null,
    lastError: row.last_error,
    retryCount: row.retry_count,
    expectedMaxLagMinutes: row.expected_max_lag_minutes,
    syncMode: row.sync_mode,
    rollingWindowDays: row.rolling_window_days,
    rateLimitPolicy: {
      requestsPerMinute: row.requests_per_minute,
      burstLimit: row.burst_limit,
      backoffBaseMs: row.backoff_base_ms,
    },
    health: row.health,
  };
}

function mapFxRate(row: any) {
  return {
    id: row.id,
    baseCurrency: row.base_currency,
    quoteCurrency: row.quote_currency,
    rate: Number(row.rate),
    rateDate: row.rate_date.toISOString().slice(0, 10),
    source: row.source,
  };
}

function mapFact(row: any): NormalizedFact {
  return {
    id: row.id,
    clientId: row.client_id,
    source: row.source,
    sourceRecordKey: row.source_record_key,
    factType: row.fact_type,
    occurredAtUtc: row.occurred_at_utc.toISOString(),
    reportingTimezone: row.reporting_timezone,
    reportingDateLocal: row.reporting_date_local.toISOString().slice(0, 10),
    valueKind: row.value_kind,
    value: Number(row.value),
    currencyNative: row.currency_native,
    amountNative: row.amount_native === null ? undefined : Number(row.amount_native),
    currencyReporting: row.currency_reporting,
    amountReporting: row.amount_reporting === null ? undefined : Number(row.amount_reporting),
    fxRate: row.fx_rate === null ? undefined : Number(row.fx_rate),
    fxRateDate: row.fx_rate_date?.toISOString().slice(0, 10),
    dimensions: {
      campaignId: row.campaign_id ?? undefined,
      campaignName: row.campaign_name ?? undefined,
      adsetId: row.adset_id ?? undefined,
      adsetName: row.adset_name ?? undefined,
      adId: row.ad_id ?? undefined,
      adName: row.ad_name ?? undefined,
      funnelId: row.funnel_id ?? undefined,
      funnelName: row.funnel_name ?? undefined,
      formId: row.form_id ?? undefined,
      formName: row.form_name ?? undefined,
      calendarId: row.calendar_id ?? undefined,
      calendarName: row.calendar_name ?? undefined,
      pipelineId: row.pipeline_id ?? undefined,
      pipelineName: row.pipeline_name ?? undefined,
      stageId: row.stage_id ?? undefined,
      stageName: row.stage_name ?? undefined,
      opportunityId: row.opportunity_id ?? undefined,
      ownerId: row.owner_id ?? undefined,
      ownerName: row.owner_name ?? undefined,
      contactKey: row.contact_key ?? undefined,
      externalAttributionKey: row.external_attribution_key ?? undefined,
      extraJson: row.extra_json ?? undefined,
    },
    rawSnapshotId: row.raw_snapshot_id,
    syncedAt: row.synced_at.toISOString(),
    reasonCode: row.reason_code ?? undefined,
    importBatchId: row.import_batch_id ?? undefined,
    isDeleted: row.is_deleted,
  };
}

function mapIdentityLink(row: any) {
  return {
    id: row.id,
    clientId: row.client_id,
    contactKey: row.contact_key,
    normalizedEmailHash: row.normalized_email_hash ?? undefined,
    normalizedPhoneHash: row.normalized_phone_hash ?? undefined,
    metaLeadKey: row.meta_lead_key ?? undefined,
    ghlContactKey: row.ghl_contact_key ?? undefined,
    closeLeadKey: row.close_lead_key ?? undefined,
  };
}

function mapAnnotation(row: any): ReportAnnotation {
  return {
    clientId: row.client_id,
    reportMonth: row.report_month,
    metricKey: row.metric_key,
    status: row.status,
    ownerUserId: row.owner_user_id,
    sourceNote: row.source_note,
    riskNote: row.risk_note,
    manualOverrideValue:
      row.manual_override_value === null ? null : Number(row.manual_override_value),
    overrideReason: row.override_reason,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapException(row: any): ReviewException {
  return {
    id: row.id,
    clientId: row.client_id,
    reportMonth: row.report_month,
    type: row.type,
    status: row.status,
    title: row.title,
    detail: row.detail,
    metricKey: row.metric_key ?? undefined,
    relatedSource: row.related_source ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapBatch(row: any): ManualImportBatch {
  return {
    id: row.id,
    clientId: row.client_id,
    uploadType: row.upload_type,
    fileName: row.file_name,
    uploadedBy: row.uploaded_by,
    rowCount: row.row_count,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
  };
}

async function ensureClientAccess(
  client: PoolClient,
  userId: string,
  clientId: string,
  requireAdmin = false,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(client, userId);
  if (!user) {
    throw new AppError(401, "You must be signed in.");
  }

  if (user.isPlatformAdmin) {
    return user;
  }

  const membership = user.memberships.find((entry) => entry.clientId === clientId);
  if (!membership) {
    throw new AppError(403, "You do not have access to this client.");
  }

  if (requireAdmin && membership.role !== "agency_admin") {
    throw new AppError(403, "You need agency_admin access for this action.");
  }

  return user;
}

async function getAuthenticatedUser(
  client: PoolClient,
  userId: string,
): Promise<AuthenticatedUser | null> {
  const userResult = await client.query("select * from app_users where id = $1", [userId]);
  if (userResult.rowCount === 0) {
    return null;
  }

  const memberships = await client.query(
    "select client_id, user_id, role from client_memberships where user_id = $1",
    [userId],
  );

  return {
    ...mapUser(userResult.rows[0]),
    memberships: memberships.rows.map((row) => ({
      clientId: row.client_id,
      role: row.role,
    })),
  };
}

function targetableMetricKeys(): MetricKey[] {
  return METRIC_DEFINITIONS.filter((metric) => metric.targetable).map((metric) => metric.key);
}

function preferredSourcePriority(preferred: string | undefined): string[] {
  const all = ["meta_ads", "gohighlevel", "close", "manual_import"];
  if (!preferred || !all.includes(preferred)) {
    return all;
  }
  return [preferred, ...all.filter((source) => source !== preferred)];
}

async function loadStore(
  client: PoolClient,
  clientIds: string[],
): Promise<AppStore> {
  if (clientIds.length === 0) {
    return {
      users: [],
      memberships: [],
      clients: [],
      dataSources: [],
      fxRates: [],
      rawSnapshots: [],
      facts: [],
      identityLinks: [],
      annotations: [],
      reportVersions: [],
      exceptions: [],
    };
  }

  const [
    usersResult,
    membershipsResult,
    clientsResult,
    targetsResult,
    sourceRulesResult,
    dataSourcesResult,
    fxRatesResult,
    rawSnapshotsResult,
    factsResult,
    identityLinksResult,
    annotationsResult,
    versionsResult,
    versionMetricsResult,
    exceptionsResult,
  ] = await Promise.all([
    client.query("select * from app_users order by created_at asc"),
    client.query("select * from client_memberships where client_id = any($1::text[])", [clientIds]),
    client.query("select * from clients where id = any($1::text[]) order by created_at asc", [clientIds]),
    client.query("select * from metric_targets where client_id = any($1::text[])", [clientIds]),
    client.query("select * from metric_source_rules where client_id = any($1::text[])", [clientIds]),
    client.query("select * from data_sources where client_id = any($1::text[]) order by source asc", [clientIds]),
    client.query("select * from fx_rates order by rate_date asc"),
    client.query("select * from raw_snapshots where client_id = any($1::text[])", [clientIds]),
    client.query("select * from normalized_facts where client_id = any($1::text[])", [clientIds]),
    client.query("select * from identity_links where client_id = any($1::text[])", [clientIds]),
    client.query("select * from report_annotations where client_id = any($1::text[])", [clientIds]),
    client.query("select * from report_versions where client_id = any($1::text[])", [clientIds]),
    client.query(
      `select rvm.*, rv.client_id, rv.report_month
       from report_version_metrics rvm
       join report_versions rv on rv.id = rvm.report_version_id
       where rv.client_id = any($1::text[])`,
      [clientIds],
    ),
    client.query("select * from review_exceptions where client_id = any($1::text[])", [clientIds]),
  ]);

  const clients = clientsResult.rows.map(mapClient);
  const clientMap = new Map(clients.map((entry) => [entry.id, entry]));

  for (const row of targetsResult.rows) {
    const entry = clientMap.get(row.client_id);
    if (!entry) {
      continue;
    }
    entry.metricTargets[row.metric_key as MetricKey] = Number(row.target);
    entry.metricOwners[row.metric_key as MetricKey] = row.owner_user_id;
  }

  for (const row of sourceRulesResult.rows) {
    const entry = clientMap.get(row.client_id);
    if (!entry) {
      continue;
    }
    entry.config.metricSourceRules.push({
      metricKey: row.metric_key as MetricKey,
      sourcePriority: row.source_priority,
      fallbackToManualImport: row.fallback_to_manual_import,
    });
  }

  const versionsById = new Map<string, ReportVersion>();
  for (const row of versionsResult.rows) {
    versionsById.set(row.id, {
      id: row.id,
      clientId: row.client_id,
      reportMonth: row.report_month,
      lockedAt: row.locked_at.toISOString(),
      lockedBy: row.locked_by,
      versionNumber: row.version_number,
      snapshot: [],
    });
  }

  for (const row of versionMetricsResult.rows) {
    const version = versionsById.get(row.report_version_id);
    if (!version) {
      continue;
    }
    version.snapshot.push({
      metricKey: row.metric_key,
      value: row.value === null ? null : Number(row.value),
      status: row.status,
      ownerUserId: row.owner_user_id,
      sourceNote: row.source_note,
      riskNote: row.risk_note,
    });
  }

  return {
    users: usersResult.rows.map(mapUser),
    memberships: membershipsResult.rows.map(mapMembership),
    clients,
    dataSources: dataSourcesResult.rows.map(mapDataSource),
    fxRates: fxRatesResult.rows.map(mapFxRate),
    rawSnapshots: rawSnapshotsResult.rows.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      source: row.source,
      sourceRecordKey: row.source_record_key,
      capturedAt: row.captured_at.toISOString(),
      payload: row.payload,
    })),
    facts: factsResult.rows.map(mapFact),
    identityLinks: identityLinksResult.rows.map(mapIdentityLink),
    annotations: annotationsResult.rows.map(mapAnnotation),
    reportVersions: [...versionsById.values()],
    exceptions: exceptionsResult.rows.map(mapException),
  };
}

async function visibleClientIds(client: PoolClient, user: AuthenticatedUser): Promise<string[]> {
  if (user.isPlatformAdmin) {
    const result = await client.query("select id from clients order by created_at asc");
    return result.rows.map((row) => row.id);
  }

  return user.memberships.map((membership) => membership.clientId);
}

async function listClientUsersForClient(client: PoolClient, clientId: string): Promise<User[]> {
  const result = await client.query(
    `select distinct u.*
     from app_users u
     join client_memberships cm on cm.user_id = u.id
     where cm.client_id = $1
     order by u.name asc`,
    [clientId],
  );
  return result.rows.map(mapUser);
}

async function persistReportVersion(client: PoolClient, version: ReportVersion) {
  await client.query(
    `insert into report_versions (id, client_id, report_month, locked_at, locked_by, version_number)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      version.id,
      version.clientId,
      version.reportMonth,
      version.lockedAt,
      version.lockedBy,
      version.versionNumber,
    ],
  );

  for (const snapshot of version.snapshot) {
    await client.query(
      `insert into report_version_metrics
       (report_version_id, metric_key, value, status, owner_user_id, source_note, risk_note)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        version.id,
        snapshot.metricKey,
        snapshot.value,
        snapshot.status,
        snapshot.ownerUserId,
        snapshot.sourceNote,
        snapshot.riskNote,
      ],
    );
  }
}

async function storeCsvBatchAndFacts(
  client: PoolClient,
  appStore: AppStore,
  input: UploadCsvInput,
  prepared: ReturnType<typeof prepareCsvImport>,
) {
  const batchId = randomUUID();
  await client.query(
    `insert into manual_import_batches
     (id, client_id, upload_type, file_name, uploaded_by, row_count, status, notes)
     values ($1, $2, $3, $4, $5, $6, 'pending', null)`,
    [batchId, input.clientId, input.uploadType, input.fileName, input.uploadedBy, prepared.rowCount],
  );

  const targetClient = appStore.clients.find((entry) => entry.id === input.clientId);
  if (!targetClient) {
    throw new AppError(404, "Unknown client.");
  }

  for (const fxRate of prepared.fxRates) {
    await client.query(
      `insert into fx_rates (id, base_currency, quote_currency, rate, rate_date, source)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (base_currency, quote_currency, rate_date)
       do update set rate = excluded.rate, source = excluded.source`,
      [
        fxRate.id,
        fxRate.baseCurrency,
        fxRate.quoteCurrency,
        fxRate.rate,
        fxRate.rateDate,
        fxRate.source,
      ],
    );
  }

  const refreshedStore = await loadStore(client, [input.clientId]);
  const insertedFacts: NormalizedFact[] = [];

  for (const snapshot of prepared.rawSnapshots) {
    await client.query(
      `insert into raw_snapshots (id, client_id, source, source_record_key, captured_at, payload)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do nothing`,
      [
        snapshot.id,
        snapshot.clientId,
        snapshot.source,
        snapshot.sourceRecordKey,
        snapshot.capturedAt,
        JSON.stringify(snapshot.payload),
      ],
    );
  }

  for (const fact of prepared.facts) {
    const normalized = normalizeCurrencyFact(
      { ...fact, importBatchId: batchId },
      targetClient,
      refreshedStore.fxRates,
    );
    if (normalized.exception) {
      prepared.exceptions.push(normalized.exception);
      continue;
    }

    const conflictingManual = refreshedStore.facts.find(
      (existing) =>
        existing.clientId === input.clientId &&
        existing.source !== normalized.fact.source &&
        existing.reportingDateLocal === normalized.fact.reportingDateLocal &&
        existing.factType === normalized.fact.factType &&
        existing.dimensions.adId === normalized.fact.dimensions.adId,
    );
    if (conflictingManual) {
      prepared.exceptions.push({
        id: randomUUID(),
        clientId: input.clientId,
        reportMonth: normalized.fact.reportingDateLocal.slice(0, 7),
        type: "manual_import_conflict",
        status: "open",
        title: "Imported CSV overlaps existing facts",
        detail: `${input.uploadType} row ${normalized.fact.sourceRecordKey} overlaps existing ${conflictingManual.source} data for the same date and metric.`,
        relatedSource: conflictingManual.source,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    insertedFacts.push(normalized.fact);
  }

  for (const fact of insertedFacts) {
    await client.query(
      `insert into normalized_facts (
         id, client_id, source, source_record_key, fact_type, occurred_at_utc, reporting_timezone,
         reporting_date_local, value_kind, value, currency_native, amount_native, currency_reporting,
         amount_reporting, fx_rate, fx_rate_date, campaign_id, campaign_name, adset_id, adset_name,
         ad_id, ad_name, funnel_id, funnel_name, form_id, form_name, calendar_id, calendar_name,
         pipeline_id, pipeline_name, stage_id, stage_name, opportunity_id, owner_id, owner_name,
         contact_key, external_attribution_key, extra_json, raw_snapshot_id, synced_at, reason_code,
         import_batch_id, is_deleted
       ) values (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25, $26, $27, $28,
         $29, $30, $31, $32, $33, $34, $35,
         $36, $37, $38, $39, $40, $41,
         $42, $43
       )
       on conflict (client_id, source, source_record_key, fact_type)
       do update set
         occurred_at_utc = excluded.occurred_at_utc,
         reporting_timezone = excluded.reporting_timezone,
         reporting_date_local = excluded.reporting_date_local,
         value_kind = excluded.value_kind,
         value = excluded.value,
         currency_native = excluded.currency_native,
         amount_native = excluded.amount_native,
         currency_reporting = excluded.currency_reporting,
         amount_reporting = excluded.amount_reporting,
         fx_rate = excluded.fx_rate,
         fx_rate_date = excluded.fx_rate_date,
         campaign_id = excluded.campaign_id,
         campaign_name = excluded.campaign_name,
         adset_id = excluded.adset_id,
         adset_name = excluded.adset_name,
         ad_id = excluded.ad_id,
         ad_name = excluded.ad_name,
         funnel_id = excluded.funnel_id,
         funnel_name = excluded.funnel_name,
         form_id = excluded.form_id,
         form_name = excluded.form_name,
         calendar_id = excluded.calendar_id,
         calendar_name = excluded.calendar_name,
         pipeline_id = excluded.pipeline_id,
         pipeline_name = excluded.pipeline_name,
         stage_id = excluded.stage_id,
         stage_name = excluded.stage_name,
         opportunity_id = excluded.opportunity_id,
         owner_id = excluded.owner_id,
         owner_name = excluded.owner_name,
         contact_key = excluded.contact_key,
         external_attribution_key = excluded.external_attribution_key,
         extra_json = excluded.extra_json,
         raw_snapshot_id = excluded.raw_snapshot_id,
         synced_at = excluded.synced_at,
         reason_code = excluded.reason_code,
         import_batch_id = excluded.import_batch_id,
         is_deleted = excluded.is_deleted`,
      [
        fact.id,
        fact.clientId,
        fact.source,
        fact.sourceRecordKey,
        fact.factType,
        fact.occurredAtUtc,
        fact.reportingTimezone,
        fact.reportingDateLocal,
        fact.valueKind,
        fact.value,
        fact.currencyNative ?? null,
        fact.amountNative ?? null,
        fact.currencyReporting ?? null,
        fact.amountReporting ?? null,
        fact.fxRate ?? null,
        fact.fxRateDate ?? null,
        fact.dimensions.campaignId ?? null,
        fact.dimensions.campaignName ?? null,
        fact.dimensions.adsetId ?? null,
        fact.dimensions.adsetName ?? null,
        fact.dimensions.adId ?? null,
        fact.dimensions.adName ?? null,
        fact.dimensions.funnelId ?? null,
        fact.dimensions.funnelName ?? null,
        fact.dimensions.formId ?? null,
        fact.dimensions.formName ?? null,
        fact.dimensions.calendarId ?? null,
        fact.dimensions.calendarName ?? null,
        fact.dimensions.pipelineId ?? null,
        fact.dimensions.pipelineName ?? null,
        fact.dimensions.stageId ?? null,
        fact.dimensions.stageName ?? null,
        fact.dimensions.opportunityId ?? null,
        fact.dimensions.ownerId ?? null,
        fact.dimensions.ownerName ?? null,
        fact.dimensions.contactKey ?? null,
        fact.dimensions.externalAttributionKey ?? null,
        fact.dimensions.extraJson ? JSON.stringify(fact.dimensions.extraJson) : null,
        fact.rawSnapshotId,
        fact.syncedAt,
        fact.reasonCode ?? null,
        fact.importBatchId ?? null,
        fact.isDeleted ?? false,
      ],
    );
  }

  for (const exception of prepared.exceptions) {
    await client.query(
      `insert into review_exceptions
       (id, client_id, report_month, type, status, title, detail, metric_key, related_source, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        exception.id,
        exception.clientId,
        exception.reportMonth,
        exception.type,
        exception.status,
        exception.title,
        exception.detail,
        exception.metricKey ?? null,
        exception.relatedSource ?? null,
        exception.createdAt,
        exception.updatedAt,
      ],
    );
  }

  await client.query(
    `update manual_import_batches
     set status = 'completed', notes = $2
     where id = $1`,
    [batchId, prepared.exceptions.length > 0 ? `${prepared.exceptions.length} exceptions created.` : null],
  );

  return {
    batchId,
    createdFacts: insertedFacts.length,
  };
}

export function createDemoService(): LiveAppService {
  return {
    mode: "demo",
    async getCurrentUser() {
      const store = createStore();
      const user = store.users[0];
      return user
        ? { ...user, memberships: store.memberships.filter((m) => m.userId === user.id).map((m) => ({ clientId: m.clientId, role: m.role })) }
        : null;
    },
    async getUserByEmail(email) {
      const store = createStore();
      const user = store.users.find((entry) => entry.email === email);
      return user
        ? { ...user, memberships: store.memberships.filter((m) => m.userId === user.id).map((m) => ({ clientId: m.clientId, role: m.role })) }
        : null;
    },
    async upsertGoogleUser({ email, name }) {
      const store = createStore();
      const user = store.users.find((entry) => entry.email === email) ?? {
        id: "user-admin",
        name,
        email,
        isPlatformAdmin: true,
      };
      return {
        ...user,
        memberships: store.memberships.filter((m) => m.userId === user.id).map((m) => ({ clientId: m.clientId, role: m.role })),
      };
    },
    async listVisibleClients() {
      return createStore().clients;
    },
    async getMissionControl() {
      return buildMissionControl(createStore());
    },
    async getScorecard(_userId, clientId, reportMonth) {
      return createAppApi(createStore()).getScorecard(clientId, reportMonth);
    },
    async getPerformanceReport(_userId, clientId, reportMonth, reportKey) {
      return createAppApi(createStore()).getPerformanceReport(clientId, reportMonth, reportKey);
    },
    async listClientUsers() {
      return createStore().users;
    },
    async listUploadBatches() {
      return [];
    },
    async listExceptions(_userId, clientId, reportMonth) {
      return createStore().exceptions.filter(
        (entry) => entry.clientId === clientId && (reportMonth ? entry.reportMonth === reportMonth : true),
      );
    },
    async createClient() {
      throw new AppError(400, "Client creation is unavailable in demo mode.");
    },
    async addAnnotation() {
      throw new AppError(400, "Annotations are unavailable in demo mode.");
    },
    async uploadCsv() {
      throw new AppError(400, "CSV uploads are unavailable in demo mode.");
    },
    async resolveException() {
      throw new AppError(400, "Exception updates are unavailable in demo mode.");
    },
    async lockReport() {
      throw new AppError(400, "Locking is unavailable in demo mode.");
    },
    async unlockReport() {
      throw new AppError(400, "Unlocking is unavailable in demo mode.");
    },
  };
}

export function createDatabaseService(): LiveAppService {
  return {
    mode: "database",
    async getCurrentUser(userId) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        return await getAuthenticatedUser(client, userId);
      } finally {
        client.release();
      }
    },
    async getUserByEmail(email) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const userResult = await client.query("select * from app_users where lower(email) = lower($1)", [email]);
        if (userResult.rowCount === 0) {
          return null;
        }
        return getAuthenticatedUser(client, userResult.rows[0].id);
      } finally {
        client.release();
      }
    },
    async upsertGoogleUser(input) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("begin");
        const existing = await client.query(
          "select * from app_users where google_subject = $1 or lower(email) = lower($2)",
          [input.googleSubject, input.email],
        );
        let userId = existing.rows[0]?.id;
        if (!userId) {
          userId = randomUUID();
          await client.query(
            `insert into app_users (id, name, email, google_subject, is_platform_admin)
             values ($1, $2, $3, $4, false)`,
            [userId, input.name, input.email, input.googleSubject],
          );
        } else {
          await client.query(
            `update app_users
             set name = $2, email = $3, google_subject = $4
             where id = $1`,
            [userId, input.name, input.email, input.googleSubject],
          );
        }
        await client.query("commit");
        const user = await getAuthenticatedUser(client, userId);
        if (!user) {
          throw new AppError(500, "Failed to load authenticated user.");
        }
        return user;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
    async listVisibleClients(userId) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const user = await getAuthenticatedUser(client, userId);
        if (!user) {
          throw new AppError(401, "You must be signed in.");
        }
        const ids = await visibleClientIds(client, user);
        const store = await loadStore(client, ids);
        return store.clients;
      } finally {
        client.release();
      }
    },
    async getMissionControl(userId) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const user = await getAuthenticatedUser(client, userId);
        if (!user) {
          throw new AppError(401, "You must be signed in.");
        }
        const ids = await visibleClientIds(client, user);
        const store = await loadStore(client, ids);
        return buildMissionControl(store);
      } finally {
        client.release();
      }
    },
    async getScorecard(userId, clientId, reportMonth) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await ensureClientAccess(client, userId, clientId);
        const store = await loadStore(client, [clientId]);
        return getScorecardReport(store, clientId, reportMonth);
      } finally {
        client.release();
      }
    },
    async getPerformanceReport(userId, clientId, reportMonth, reportKey) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await ensureClientAccess(client, userId, clientId);
        const store = await loadStore(client, [clientId]);
        return getPerformanceReport(store, clientId, reportMonth, reportKey);
      } finally {
        client.release();
      }
    },
    async listClientUsers(userId, clientId) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await ensureClientAccess(client, userId, clientId);
        return listClientUsersForClient(client, clientId);
      } finally {
        client.release();
      }
    },
    async listUploadBatches(userId, clientId) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await ensureClientAccess(client, userId, clientId);
        const result = await client.query(
          "select * from manual_import_batches where client_id = $1 order by created_at desc limit 20",
          [clientId],
        );
        return result.rows.map(mapBatch);
      } finally {
        client.release();
      }
    },
    async listExceptions(userId, clientId, reportMonth) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await ensureClientAccess(client, userId, clientId);
        const store = await loadStore(client, [clientId]);
        const reportMonthToUse = reportMonth ?? new Date().toISOString().slice(0, 7);
        return getScorecardReport(store, clientId, reportMonthToUse).openExceptions;
      } finally {
        client.release();
      }
    },
    async createClient(userId, input) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const user = await getAuthenticatedUser(client, userId);
        if (!user) {
          throw new AppError(401, "You must be signed in.");
        }
        if (!user.isPlatformAdmin) {
          throw new AppError(403, "Only platform admins can create clients.");
        }

        await client.query("begin");
        const clientId = randomUUID();
        await client.query(
          `insert into clients (
            id, name, reporting_timezone, reporting_currency, spend_basis, lead_definition,
            new_client_definition, pipeline_mappings, booking_mappings, revenue_mappings,
            duplicate_rules, manual_import_sources, onboarding_completed_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
          [
            clientId,
            input.name,
            input.reportingTimezone,
            input.reportingCurrency,
            input.spendBasis,
            input.leadDefinition,
            input.newClientDefinition,
            JSON.stringify({ notes: [input.pipelineMappingNotes] }),
            JSON.stringify({ notes: [input.bookingMappingNotes] }),
            JSON.stringify({ notes: input.revenueMappingNotes }),
            input.duplicateRules,
            input.manualImportSources,
          ],
        );

        await client.query(
          `insert into client_memberships (client_id, user_id, role)
           values ($1, $2, 'agency_admin')`,
          [clientId, userId],
        );

        for (const metricKey of targetableMetricKeys()) {
          const target = input.metricTargets[metricKey];
          if (target !== undefined && target !== null && !Number.isNaN(target)) {
            await client.query(
              `insert into metric_targets (client_id, metric_key, target, owner_user_id)
               values ($1, $2, $3, $4)`,
              [clientId, metricKey, target, input.defaultOwnerUserId],
            );
          }
        }

        const configurableMetrics: MetricKey[] = [
          "total_spend",
          "leads",
          "strategy_calls",
          "triage_calls",
          "new_clients",
          "new_revenue_booked",
          "new_revenue_collected",
        ];

        for (const metricKey of configurableMetrics) {
          await client.query(
            `insert into metric_source_rules (client_id, metric_key, source_priority, fallback_to_manual_import)
             values ($1, $2, $3, true)`,
            [clientId, metricKey, preferredSourcePriority(input.sourcePriorityByMetric[metricKey])],
          );
        }

        const dataSources = [
          ["meta_ads", "Meta CSV Uploads"],
          ["gohighlevel", "GoHighLevel CSV Uploads"],
          ["close", "Close CSV Uploads"],
          ["manual_import", "Manual Adjustments"],
        ] as const;

        for (const [source, displayName] of dataSources) {
          await client.query(
            `insert into data_sources (
              id, client_id, source, display_name, account_currency, credential_status, secret_ref,
              expires_at, last_refresh_at, last_synced_at, last_success_at, last_error, retry_count,
              expected_max_lag_minutes, sync_mode, rolling_window_days, requests_per_minute, burst_limit,
              backoff_base_ms, health
            ) values (
              $1, $2, $3, $4, $5, 'healthy', 'csv-only',
              null, null, null, null, null, 0,
              1440, 'manual_only', 0, 0, 0,
              0, 'manual'
            )`,
            [randomUUID(), clientId, source, displayName, input.reportingCurrency],
          );
        }

        await client.query("commit");
        return { clientId };
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
    async addAnnotation(userId, input) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await ensureClientAccess(client, userId, input.clientId);
        await client.query(
          `insert into report_annotations (
            client_id, report_month, metric_key, status, owner_user_id, source_note, risk_note,
            manual_override_value, override_reason, updated_by, updated_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
          on conflict (client_id, report_month, metric_key)
          do update set
            status = excluded.status,
            owner_user_id = excluded.owner_user_id,
            source_note = excluded.source_note,
            risk_note = excluded.risk_note,
            manual_override_value = excluded.manual_override_value,
            override_reason = excluded.override_reason,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at`,
          [
            input.clientId,
            input.reportMonth,
            input.metricKey,
            input.status,
            input.ownerUserId,
            input.sourceNote,
            input.riskNote,
            input.manualOverrideValue,
            input.overrideReason,
            userId,
          ],
        );
      } finally {
        client.release();
      }
    },
    async uploadCsv(userId, input) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await ensureClientAccess(client, userId, input.clientId);
        await client.query("begin");
        const store = await loadStore(client, [input.clientId]);
        const targetClient = store.clients.find((entry) => entry.id === input.clientId);
        if (!targetClient) {
          throw new AppError(404, "Unknown client.");
        }
        const prepared = prepareCsvImport({
          clientId: input.clientId,
          reportingTimezone: targetClient.config.reportingTimezone,
          uploadType: input.uploadType,
          csvText: input.csvText,
          fileName: input.fileName,
        });
        const result = await storeCsvBatchAndFacts(client, store, input, prepared);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
    async resolveException(userId, input) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const exceptionResult = await client.query(
          "select * from review_exceptions where id = $1",
          [input.exceptionId],
        );
        if (exceptionResult.rowCount === 0) {
          throw new AppError(404, "Unknown exception.");
        }
        await ensureClientAccess(client, userId, exceptionResult.rows[0].client_id);
        await client.query(
          "update review_exceptions set status = $2, updated_at = now() where id = $1",
          [input.exceptionId, input.status],
        );
      } finally {
        client.release();
      }
    },
    async lockReport(userId, input) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await ensureClientAccess(client, userId, input.clientId);
        await client.query("begin");
        const store = await loadStore(client, [input.clientId]);
        const version = buildLockedReport(store, input.clientId, input.reportMonth, userId);
        await persistReportVersion(client, version);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
    async unlockReport(userId, input) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await ensureClientAccess(client, userId, input.clientId, true);
        await client.query("begin");
        const store = await loadStore(client, [input.clientId]);
        const unlocked = unlockLatestReport(store, input.clientId, input.reportMonth);
        if (!unlocked) {
          throw new AppError(404, "No locked version found for this month.");
        }
        await client.query(
          "delete from report_versions where id = $1",
          [unlocked.id],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
