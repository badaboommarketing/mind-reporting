import { normalizeCurrencyFact } from "../domain/currency.js";
import {
  AppStore,
  ClientMembership,
  MetricStatus,
  NormalizedFact,
  ReportAnnotation,
  ReviewException,
  SourcePlatform,
  UserRole,
} from "../domain/model.js";
import {
  applyAnnotation,
  buildMissionControl,
  getPerformanceReport,
  getScorecardReport,
  lockReport,
  unlockLatestReport,
} from "../domain/reporting.js";
import { toReportingDate } from "../domain/time.js";
import { createSeedStore } from "./seed.js";

export function createStore(): AppStore {
  const store = createSeedStore();
  const normalizedFacts: NormalizedFact[] = [];
  const generatedExceptions: ReviewException[] = [];

  for (const fact of store.facts) {
    const client = store.clients.find((entry) => entry.id === fact.clientId);
    if (!client) {
      continue;
    }

    const normalized = normalizeCurrencyFact(fact, client, store.fxRates);
    normalizedFacts.push(normalized.fact);
    if (normalized.exception) {
      generatedExceptions.push(normalized.exception);
    }
  }

  store.facts = normalizedFacts;
  store.exceptions.push(...generatedExceptions);
  return store;
}

export function requireClientRole(
  store: AppStore,
  userId: string,
  clientId: string,
  allowedRoles: UserRole[],
): ClientMembership {
  const membership = store.memberships.find(
    (entry) => entry.userId === userId && entry.clientId === clientId,
  );
  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new Error(`User ${userId} is not allowed to modify client ${clientId}.`);
  }

  return membership;
}

export function addReportAnnotation(
  store: AppStore,
  input: {
    clientId: string;
    reportMonth: string;
    metricKey: ReportAnnotation["metricKey"];
    status: MetricStatus;
    ownerUserId: string | null;
    sourceNote: string | null;
    riskNote: string | null;
    manualOverrideValue: number | null;
    overrideReason: string | null;
    updatedBy: string;
  },
) {
  requireClientRole(store, input.updatedBy, input.clientId, [
    "agency_admin",
    "client_editor",
  ]);

  applyAnnotation(store, {
    ...input,
    updatedAt: new Date().toISOString(),
  });

  return getScorecardReport(store, input.clientId, input.reportMonth);
}

export function addManualImport(
  store: AppStore,
  input: {
    clientId: string;
    uploadedBy: string;
    reasonCode: string;
    rows: Array<{
      sourceRecordKey: string;
      factType: NormalizedFact["factType"];
      occurredAtUtc: string;
      valueKind: NormalizedFact["valueKind"];
      value: number;
      currencyNative?: string;
      amountNative?: number;
      dimensions: NormalizedFact["dimensions"];
    }>;
  },
) {
  requireClientRole(store, input.uploadedBy, input.clientId, [
    "agency_admin",
    "client_editor",
  ]);

  const client = store.clients.find((entry) => entry.id === input.clientId);
  if (!client) {
    throw new Error(`Unknown client ${input.clientId}`);
  }

  const batchId = `import-${Date.now()}`;

  for (const row of input.rows) {
    const importedFact: NormalizedFact = {
      id: `manual-${batchId}-${row.sourceRecordKey}`,
      clientId: input.clientId,
      source: "manual_import",
      sourceRecordKey: row.sourceRecordKey,
      factType: row.factType,
      occurredAtUtc: row.occurredAtUtc,
      reportingTimezone: client.config.reportingTimezone,
      reportingDateLocal: toReportingDate(row.occurredAtUtc, client.config.reportingTimezone),
      valueKind: row.valueKind,
      value: row.value,
      amountNative: row.amountNative,
      currencyNative: row.currencyNative,
      dimensions: row.dimensions,
      rawSnapshotId: `manual-snapshot-${batchId}`,
      syncedAt: new Date().toISOString(),
      reasonCode: input.reasonCode,
      importBatchId: batchId,
    };

    const normalized = normalizeCurrencyFact(importedFact, client, store.fxRates);
    store.facts.push(normalized.fact);
    if (normalized.exception) {
      store.exceptions.push(normalized.exception);
    }

    const conflictingFact = store.facts.find(
      (fact) =>
        fact.clientId === input.clientId &&
        fact.source !== "manual_import" &&
        fact.factType === row.factType &&
        fact.reportingDateLocal === normalized.fact.reportingDateLocal &&
        fact.dimensions.adId === normalized.fact.dimensions.adId,
    );

    if (conflictingFact) {
      store.exceptions.push({
        id: `manual-conflict-${batchId}-${row.sourceRecordKey}`,
        clientId: input.clientId,
        reportMonth: normalized.fact.reportingDateLocal.slice(0, 7),
        type: "manual_import_conflict",
        status: "open",
        title: "Manual import overlaps connector data",
        detail: `Manual ${row.factType} row ${row.sourceRecordKey} overlaps ${conflictingFact.source} fact ${conflictingFact.sourceRecordKey}.`,
        relatedSource: conflictingFact.source as SourcePlatform,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return { batchId };
}

export function resolveException(
  store: AppStore,
  input: {
    exceptionId: string;
    status: ReviewException["status"];
    updatedBy: string;
  },
) {
  const exception = store.exceptions.find((entry) => entry.id === input.exceptionId);
  if (!exception) {
    throw new Error(`Unknown exception ${input.exceptionId}`);
  }
  requireClientRole(store, input.updatedBy, exception.clientId, [
    "agency_admin",
    "client_editor",
  ]);
  exception.status = input.status;
  exception.updatedAt = new Date().toISOString();
  return exception;
}

export function lockClientReport(
  store: AppStore,
  input: { clientId: string; reportMonth: string; actorUserId: string },
) {
  requireClientRole(store, input.actorUserId, input.clientId, [
    "agency_admin",
    "client_editor",
  ]);
  return lockReport(store, input.clientId, input.reportMonth, input.actorUserId);
}

export function unlockClientReport(
  store: AppStore,
  input: { clientId: string; reportMonth: string; actorUserId: string },
) {
  requireClientRole(store, input.actorUserId, input.clientId, ["agency_admin"]);
  return unlockLatestReport(store, input.clientId, input.reportMonth);
}

export function createAppApi(store: AppStore) {
  return {
    listClients: () => store.clients,
    getMissionControl: () => buildMissionControl(store),
    getScorecard: (clientId: string, reportMonth: string) =>
      getScorecardReport(store, clientId, reportMonth),
    getPerformanceReport: (
      clientId: string,
      reportMonth: string,
      reportKey: Parameters<typeof getPerformanceReport>[3],
    ) => getPerformanceReport(store, clientId, reportMonth, reportKey),
    addReportAnnotation: (input: Parameters<typeof addReportAnnotation>[1]) =>
      addReportAnnotation(store, input),
    addManualImport: (input: Parameters<typeof addManualImport>[1]) =>
      addManualImport(store, input),
    resolveException: (input: Parameters<typeof resolveException>[1]) =>
      resolveException(store, input),
    lockClientReport: (input: Parameters<typeof lockClientReport>[1]) =>
      lockClientReport(store, input),
    unlockClientReport: (input: Parameters<typeof unlockClientReport>[1]) =>
      unlockClientReport(store, input),
    store,
  };
}
