import {
  AppStore,
  Client,
  ConnectorHealth,
  DataSource,
  MetricComputation,
  MetricKey,
  MetricStatus,
  MetricValueSet,
  NormalizedFact,
  PerformanceReport,
  PerformanceReportKey,
  PerformanceReportRow,
  PublishedMetricSnapshot,
  ReportAnnotation,
  ReportVersion,
  ReviewException,
  ScorecardReport,
  SourcePlatform,
  WeekBucket,
} from "./model.js";
import {
  METRIC_BY_KEY,
  METRIC_DEFINITIONS,
  PERFORMANCE_REPORT_DEFINITIONS,
} from "./metrics.js";
import { daysInMonth, elapsedReportingDays, getWeekBucket, isInMonth, weekBuckets } from "./time.js";
import { average, keyBy, round, safeDivide, sum, unique } from "./utils.js";

const ALL_SOURCES: SourcePlatform[] = ["meta_ads", "gohighlevel", "close", "manual_import"];

function emptyValueSet(): MetricValueSet {
  return {
    weeklyBuckets: {
      "1-7": null,
      "8-14": null,
      "15-21": null,
      "22-28": null,
      "29-EOM": null,
    },
    monthlyActual: null,
  };
}

function cloneValueSet(valueSet: MetricValueSet): MetricValueSet {
  return {
    weeklyBuckets: { ...valueSet.weeklyBuckets },
    monthlyActual: valueSet.monthlyActual,
  };
}

function addToBucket(
  result: MetricValueSet,
  bucket: WeekBucket,
  value: number,
): MetricValueSet {
  const next = cloneValueSet(result);
  next.weeklyBuckets[bucket] = round((next.weeklyBuckets[bucket] ?? 0) + value);
  next.monthlyActual = sum(Object.values(next.weeklyBuckets));
  return next;
}

function resolveBaseMetricForSource(
  facts: NormalizedFact[],
  factType: string,
  reportMonth: string,
): MetricValueSet {
  return facts
    .filter((fact) => fact.factType === factType && !fact.isDeleted && isInMonth(fact.reportingDateLocal, reportMonth))
    .reduce((result, fact) => addToBucket(result, getWeekBucket(fact.reportingDateLocal), fact.value), emptyValueSet());
}

function resolveDerivedMetric(metricKey: MetricKey, values: Record<MetricKey, MetricValueSet>): MetricValueSet {
  const buildFromBuckets = (formula: (bucket: WeekBucket) => number | null): MetricValueSet => {
    const next = emptyValueSet();
    for (const bucket of weekBuckets()) {
      next.weeklyBuckets[bucket] = formula(bucket);
    }
    next.monthlyActual = deriveMonthlyValue(metricKey, next.weeklyBuckets, values);
    return next;
  };

  switch (metricKey) {
    case "cost_per_new_client":
      return buildFromBuckets((bucket) =>
        safeDivide(values.total_spend.weeklyBuckets[bucket], values.new_clients.weeklyBuckets[bucket]),
      );
    case "cost_per_strategy_call":
      return buildFromBuckets((bucket) =>
        safeDivide(
          values.total_spend.weeklyBuckets[bucket],
          values.strategy_calls.weeklyBuckets[bucket],
        ),
      );
    case "cost_per_triage_call":
      return buildFromBuckets((bucket) =>
        safeDivide(
          values.total_spend.weeklyBuckets[bucket],
          values.triage_calls.weeklyBuckets[bucket],
        ),
      );
    case "cost_per_lead":
      return buildFromBuckets((bucket) =>
        safeDivide(values.total_spend.weeklyBuckets[bucket], values.leads.weeklyBuckets[bucket]),
      );
    case "contribution_margin_collected":
      return buildFromBuckets((bucket) =>
        values.new_revenue_collected.weeklyBuckets[bucket] === null ||
        values.total_spend.weeklyBuckets[bucket] === null
          ? null
          : round(
              (values.new_revenue_collected.weeklyBuckets[bucket] ?? 0) -
                (values.total_spend.weeklyBuckets[bucket] ?? 0),
            ),
      );
    case "contribution_margin_booked":
      return buildFromBuckets((bucket) =>
        values.new_revenue_booked.weeklyBuckets[bucket] === null ||
        values.total_spend.weeklyBuckets[bucket] === null
          ? null
          : round(
              (values.new_revenue_booked.weeklyBuckets[bucket] ?? 0) -
                (values.total_spend.weeklyBuckets[bucket] ?? 0),
            ),
      );
    case "weekly_roas":
      return buildFromBuckets((bucket) =>
        safeDivide(
          values.new_revenue_collected.weeklyBuckets[bucket],
          values.total_spend.weeklyBuckets[bucket],
        ),
      );
    case "monthly_roas":
      return buildFromBuckets((bucket) =>
        safeDivide(
          values.new_revenue_collected.weeklyBuckets[bucket],
          values.total_spend.weeklyBuckets[bucket],
        ),
      );
    case "ctr":
      return buildFromBuckets((bucket) =>
        safeDivide(values.link_clicks.weeklyBuckets[bucket], values.impressions.weeklyBuckets[bucket]),
      );
    case "cpm":
      return buildFromBuckets((bucket) => {
        const spend = values.total_spend.weeklyBuckets[bucket];
        const impressions = values.impressions.weeklyBuckets[bucket];
        const ratio = safeDivide(spend, impressions);
        return ratio === null ? null : round(ratio * 1000);
      });
    case "calls":
      return buildFromBuckets((bucket) =>
        sum([
          values.strategy_calls.weeklyBuckets[bucket],
          values.triage_calls.weeklyBuckets[bucket],
        ]),
      );
    case "cost_per_call":
      return buildFromBuckets((bucket) =>
        safeDivide(values.total_spend.weeklyBuckets[bucket], values.calls.weeklyBuckets[bucket]),
      );
    default:
      return values[metricKey] ?? emptyValueSet();
  }
}

function deriveMonthlyValue(
  metricKey: MetricKey,
  buckets: MetricValueSet["weeklyBuckets"],
  values: Record<MetricKey, MetricValueSet>,
): number | null {
  if (metricKey === "weekly_roas") {
    return average(Object.values(buckets));
  }

  if (metricKey === "monthly_roas") {
    return safeDivide(
      values.new_revenue_collected.monthlyActual,
      values.total_spend.monthlyActual,
    );
  }

  if (metricKey === "cost_per_new_client") {
    return safeDivide(values.total_spend.monthlyActual, values.new_clients.monthlyActual);
  }

  if (metricKey === "cost_per_strategy_call") {
    return safeDivide(values.total_spend.monthlyActual, values.strategy_calls.monthlyActual);
  }

  if (metricKey === "cost_per_triage_call") {
    return safeDivide(values.total_spend.monthlyActual, values.triage_calls.monthlyActual);
  }

  if (metricKey === "cost_per_lead") {
    return safeDivide(values.total_spend.monthlyActual, values.leads.monthlyActual);
  }

  if (metricKey === "ctr") {
    return safeDivide(values.link_clicks.monthlyActual, values.impressions.monthlyActual);
  }

  if (metricKey === "cpm") {
    const ratio = safeDivide(values.total_spend.monthlyActual, values.impressions.monthlyActual);
    return ratio === null ? null : round(ratio * 1000);
  }

  if (metricKey === "calls") {
    return sum([values.strategy_calls.monthlyActual, values.triage_calls.monthlyActual]);
  }

  if (metricKey === "cost_per_call") {
    return safeDivide(values.total_spend.monthlyActual, values.calls.monthlyActual);
  }

  return sum(Object.values(buckets));
}

function buildSourceMetricMap(
  facts: NormalizedFact[],
  reportMonth: string,
): Record<SourcePlatform, Record<MetricKey, MetricValueSet>> {
  const sourceMap = Object.fromEntries(
    ALL_SOURCES.map((source) => [source, {} as Record<MetricKey, MetricValueSet>]),
  ) as Record<SourcePlatform, Record<MetricKey, MetricValueSet>>;

  for (const source of ALL_SOURCES) {
    const sourceFacts = facts.filter((fact) => fact.source === source);
    for (const metric of METRIC_DEFINITIONS) {
      if (metric.kind === "base" && metric.sourceFactType) {
        sourceMap[source][metric.key] = resolveBaseMetricForSource(
          sourceFacts,
          metric.sourceFactType,
          reportMonth,
        );
      }
    }

    for (const metric of METRIC_DEFINITIONS) {
      if (metric.kind === "derived") {
        sourceMap[source][metric.key] = resolveDerivedMetric(metric.key, sourceMap[source]);
      }
    }
  }

  return sourceMap;
}

function getMetricRule(client: Client, metricKey: MetricKey): SourcePlatform[] {
  return (
    client.config.metricSourceRules.find((rule) => rule.metricKey === metricKey)?.sourcePriority ??
    METRIC_BY_KEY.get(metricKey)?.sourcePriority ??
    ALL_SOURCES
  );
}

function latestAnnotation(
  annotations: ReportAnnotation[],
  metricKey: MetricKey,
): ReportAnnotation | undefined {
  return [...annotations]
    .filter((annotation) => annotation.metricKey === metricKey)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function latestReportVersion(
  versions: ReportVersion[],
  clientId: string,
  reportMonth: string,
): ReportVersion | undefined {
  return versions
    .filter((version) => version.clientId === clientId && version.reportMonth === reportMonth)
    .sort((left, right) => right.versionNumber - left.versionNumber)[0];
}

function resolvedMetricQuality(
  metricKey: MetricKey,
  resolvedSource: SourcePlatform | "formula" | "manual_override" | null,
  sourceValues: Partial<Record<SourcePlatform, MetricValueSet>>,
  connectors: DataSource[],
  manualOverrideValue: number | null,
): ConnectorHealth {
  if (manualOverrideValue !== null) {
    return "manual";
  }

  if (resolvedSource === null) {
    return "broken";
  }

  const presentSources = Object.entries(sourceValues)
    .filter(([, valueSet]) => valueSet?.monthlyActual !== null)
    .map(([source]) => source as SourcePlatform);

  if (presentSources.length > 1) {
    const resolved = Object.values(sourceValues)
      .map((valueSet) => valueSet?.monthlyActual)
      .filter((value): value is number => value !== null && value !== undefined);
    if (unique(resolved).length > 1 && METRIC_BY_KEY.get(metricKey)?.kind === "base") {
      return "conflicted";
    }
  }

  if (resolvedSource === "formula") {
    return "healthy";
  }

  const connector = connectors.find((dataSource) => dataSource.source === resolvedSource);
  return connector?.health ?? "healthy";
}

function computeVarianceBySource(
  resolvedMonthlyActual: number | null,
  sourceValues: Partial<Record<SourcePlatform, MetricValueSet>>,
): Partial<Record<SourcePlatform, number | null>> {
  const result: Partial<Record<SourcePlatform, number | null>> = {};
  for (const source of ALL_SOURCES) {
    const sourceMonthlyActual = sourceValues[source]?.monthlyActual;
    result[source] =
      sourceMonthlyActual === null || sourceMonthlyActual === undefined || resolvedMonthlyActual === null
        ? null
        : round(resolvedMonthlyActual - sourceMonthlyActual);
  }
  return result;
}

function buildResolvedMetricMap(
  client: Client,
  sourceMap: Record<SourcePlatform, Record<MetricKey, MetricValueSet>>,
): Record<MetricKey, MetricValueSet> {
  const resolved = {} as Record<MetricKey, MetricValueSet>;

  for (const metric of METRIC_DEFINITIONS) {
    if (metric.kind === "base") {
      const priority = getMetricRule(client, metric.key);
      const winner = priority.find(
        (source) => sourceMap[source][metric.key]?.monthlyActual !== null,
      );
      resolved[metric.key] = winner ? cloneValueSet(sourceMap[winner][metric.key]) : emptyValueSet();
    }
  }

  for (const metric of METRIC_DEFINITIONS) {
    if (metric.kind === "derived") {
      resolved[metric.key] = resolveDerivedMetric(metric.key, resolved);
    }
  }

  return resolved;
}

function computeResolvedSource(
  client: Client,
  metricKey: MetricKey,
  sourceValues: Partial<Record<SourcePlatform, MetricValueSet>>,
  manualOverrideValue: number | null,
): SourcePlatform | "formula" | "manual_override" | null {
  if (manualOverrideValue !== null) {
    return "manual_override";
  }

  const metric = METRIC_BY_KEY.get(metricKey);
  if (!metric) {
    return null;
  }

  if (metric.kind === "derived") {
    return "formula";
  }

  const priority = getMetricRule(client, metricKey);
  return (
    priority.find((source) => sourceValues[source]?.monthlyActual !== null && sourceValues[source] !== undefined) ??
    null
  );
}

function makePublishedSnapshot(metrics: MetricComputation[]): PublishedMetricSnapshot[] {
  return metrics.map((metric) => ({
    metricKey: metric.metricKey,
    value: metric.resolved.monthlyActual,
    status: metric.status,
    ownerUserId: metric.ownerUserId,
    sourceNote: metric.sourceNote,
    riskNote: metric.riskNote,
  }));
}

export function getScorecardReport(
  store: AppStore,
  clientId: string,
  reportMonth: string,
  now = new Date(),
): ScorecardReport {
  const client = store.clients.find((entry) => entry.id === clientId);
  if (!client) {
    throw new Error(`Unknown client ${clientId}`);
  }

  const facts = store.facts.filter((fact) => fact.clientId === clientId);
  const annotations = store.annotations.filter(
    (annotation) =>
      annotation.clientId === clientId && annotation.reportMonth === reportMonth,
  );
  const connectors = store.dataSources.filter((dataSource) => dataSource.clientId === clientId);
  const sourceMap = buildSourceMetricMap(facts, reportMonth);
  const resolvedMap = buildResolvedMetricMap(client, sourceMap);
  const elapsedDays = elapsedReportingDays(reportMonth, client.config.reportingTimezone, now);
  const monthDays = daysInMonth(reportMonth);

  const metrics = METRIC_DEFINITIONS.filter(
    (definition) => definition.section !== "ad_performance",
  ).map<MetricComputation>((definition) => {
    const annotation = latestAnnotation(annotations, definition.key);
    const sourceNative = Object.fromEntries(
      ALL_SOURCES.map((source) => [source, sourceMap[source][definition.key]]),
    ) as Partial<Record<SourcePlatform, MetricValueSet>>;
    const resolvedValueSet = cloneValueSet(resolvedMap[definition.key]);
    const manualOverrideValue = annotation?.manualOverrideValue ?? null;
    if (manualOverrideValue !== null) {
      resolvedValueSet.monthlyActual = manualOverrideValue;
    }

    const target = client.metricTargets[definition.key] ?? null;
    const paceProjection =
      target === null || elapsedDays === 0 || resolvedValueSet.monthlyActual === null
        ? null
        : round((resolvedValueSet.monthlyActual / elapsedDays) * monthDays);
    const pacePercent = paceProjection === null || target === 0 ? null : safeDivide(paceProjection, target);
    const resolvedSource = computeResolvedSource(client, definition.key, sourceNative, manualOverrideValue);

    return {
      metricKey: definition.key,
      label: definition.label,
      section: definition.section,
      sourceNative,
      resolved: resolvedValueSet,
      resolvedSource,
      varianceBySource: computeVarianceBySource(resolvedValueSet.monthlyActual, sourceNative),
      target,
      paceProjection,
      pacePercent,
      qualityState: resolvedMetricQuality(
        definition.key,
        resolvedSource,
        sourceNative,
        connectors,
        manualOverrideValue,
      ),
      status: annotation?.status ?? "select_status",
      ownerUserId:
        annotation?.ownerUserId ?? client.metricOwners[definition.key] ?? null,
      sourceNote: annotation?.sourceNote ?? null,
      riskNote: annotation?.riskNote ?? null,
      manualOverrideValue,
    };
  });

  const liveDriftExceptions = detectDrift(store, clientId, reportMonth, metrics);
  const openExceptions = [
    ...store.exceptions.filter(
      (entry) =>
        entry.clientId === clientId &&
        entry.status === "open" &&
        (entry.reportMonth === reportMonth || entry.reportMonth === null),
    ),
    ...liveDriftExceptions,
  ];
  const lockedVersion = latestReportVersion(store.reportVersions, clientId, reportMonth);

  return {
    clientId,
    clientName: client.name,
    reportMonth,
    reportTimezone: client.config.reportingTimezone,
    reportCurrency: client.config.reportingCurrency,
    isLocked: Boolean(lockedVersion),
    publishedVersionId: lockedVersion?.id ?? null,
    metrics,
    openExceptions,
  };
}

export function detectDrift(
  store: AppStore,
  clientId: string,
  reportMonth: string,
  metrics?: MetricComputation[],
): ReviewException[] {
  const lockedVersion = latestReportVersion(store.reportVersions, clientId, reportMonth);
  if (!lockedVersion) {
    return [];
  }

  const liveMetrics =
    metrics ??
    getScorecardReport(store, clientId, reportMonth).metrics;
  const liveByMetricKey = new Map(liveMetrics.map((metric) => [metric.metricKey, metric]));

  return lockedVersion.snapshot.flatMap((snapshot) => {
    const liveValue = liveByMetricKey.get(snapshot.metricKey)?.resolved.monthlyActual ?? null;
    if (snapshot.value === liveValue) {
      return [];
    }

    return [
      {
        id: `drift-${lockedVersion.id}-${snapshot.metricKey}`,
        clientId,
        reportMonth,
        type: "post_lock_drift",
        status: "open",
        title: `Locked report drift on ${snapshot.metricKey}`,
        detail: `Published value ${snapshot.value ?? "null"} differs from live value ${liveValue ?? "null"}.`,
        metricKey: snapshot.metricKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  });
}

function dimensionKey(fact: NormalizedFact): string | null {
  if (!fact.dimensions.adId) {
    return null;
  }

  return fact.dimensions.adId;
}

function buildPerformanceRowMetrics(
  client: Client,
  facts: NormalizedFact[],
  reportMonth: string,
): Record<MetricKey, MetricValueSet> {
  const sourceMap = buildSourceMetricMap(facts, reportMonth);
  return buildResolvedMetricMap(client, sourceMap);
}

export function getPerformanceReport(
  store: AppStore,
  clientId: string,
  reportMonth: string,
  reportKey: PerformanceReportKey,
): PerformanceReport {
  const client = store.clients.find((entry) => entry.id === clientId);
  if (!client) {
    throw new Error(`Unknown client ${clientId}`);
  }

  const definition = PERFORMANCE_REPORT_DEFINITIONS.find((entry) => entry.key === reportKey);
  if (!definition) {
    throw new Error(`Unknown performance report ${reportKey}`);
  }

  const facts = store.facts.filter(
    (fact) =>
      fact.clientId === clientId &&
      isInMonth(fact.reportingDateLocal, reportMonth) &&
      !fact.isDeleted &&
      fact.dimensions.adId,
  );

  const groups = new Map<string, NormalizedFact[]>();
  for (const fact of facts) {
    const key = dimensionKey(fact);
    if (!key) {
      continue;
    }
    const group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
  }

  const rows = [...groups.entries()]
    .map<PerformanceReportRow>(([adId, rowFacts]) => {
      const first = rowFacts[0];
      const metrics = buildPerformanceRowMetrics(client, rowFacts, reportMonth);
      return {
        dimensionKey: adId,
        adId,
        adName: first?.dimensions.adName ?? adId,
        adsetId: first?.dimensions.adsetId ?? null,
        adsetName: first?.dimensions.adsetName ?? null,
        campaignId: first?.dimensions.campaignId ?? null,
        campaignName: first?.dimensions.campaignName ?? null,
        values: Object.fromEntries(
          definition.metrics.map((metricKey) => [metricKey, metrics[metricKey]?.monthlyActual ?? null]),
        ),
      };
    })
    .sort((left, right) => (right.values.total_spend ?? 0) - (left.values.total_spend ?? 0));

  return {
    clientId,
    reportMonth,
    definition,
    currency: client.config.reportingCurrency,
    rows,
  };
}

export function applyAnnotation(
  store: AppStore,
  annotation: ReportAnnotation,
): void {
  const index = store.annotations.findIndex(
    (entry) =>
      entry.clientId === annotation.clientId &&
      entry.reportMonth === annotation.reportMonth &&
      entry.metricKey === annotation.metricKey,
  );

  if (index === -1) {
    store.annotations.push(annotation);
    return;
  }

  store.annotations[index] = annotation;
}

export function lockReport(
  store: AppStore,
  clientId: string,
  reportMonth: string,
  actorUserId: string,
): ReportVersion {
  const report = getScorecardReport(store, clientId, reportMonth);
  const versions = store.reportVersions.filter(
    (entry) => entry.clientId === clientId && entry.reportMonth === reportMonth,
  );

  const version: ReportVersion = {
    id: `rv-${clientId}-${reportMonth}-${versions.length + 1}`,
    clientId,
    reportMonth,
    lockedAt: new Date().toISOString(),
    lockedBy: actorUserId,
    versionNumber: versions.length + 1,
    snapshot: makePublishedSnapshot(report.metrics),
  };
  store.reportVersions.push(version);
  return version;
}

export function unlockLatestReport(
  store: AppStore,
  clientId: string,
  reportMonth: string,
): ReportVersion | null {
  const latest = latestReportVersion(store.reportVersions, clientId, reportMonth);
  if (!latest) {
    return null;
  }

  const index = store.reportVersions.findIndex((entry) => entry.id === latest.id);
  if (index >= 0) {
    store.reportVersions.splice(index, 1);
  }
  return latest;
}

export function buildMissionControl(store: AppStore) {
  const clientsById = keyBy(store.clients);
  const clientStatuses = store.clients.map((client) => {
    const connectors = store.dataSources.filter((entry) => entry.clientId === client.id);
    const openExceptions = store.exceptions.filter(
      (entry) => entry.clientId === client.id && entry.status === "open",
    );
    const lockedReportsWithDrift = unique(
      store.reportVersions
        .filter((entry) => entry.clientId === client.id)
        .filter((entry) => detectDrift(store, entry.clientId, entry.reportMonth).length > 0)
        .map((entry) => entry.reportMonth),
    );

    return {
      clientId: client.id,
      clientName: client.name,
      brokenConnectors: connectors.filter((entry) => entry.health === "broken").length,
      staleConnectors: connectors.filter((entry) => entry.health === "stale").length,
      openExceptions: openExceptions.length,
      lockedReportsWithDrift: lockedReportsWithDrift.length,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    openExceptionCount: store.exceptions.filter((entry) => entry.status === "open").length,
    driftedLockedReportCount: store.reportVersions.filter(
      (entry) => detectDrift(store, entry.clientId, entry.reportMonth).length > 0,
    ).length,
    brokenConnectorCount: store.dataSources.filter((entry) => entry.health === "broken").length,
    staleConnectorCount: store.dataSources.filter((entry) => entry.health === "stale").length,
    expiredCredentialCount: store.dataSources.filter(
      (entry) => entry.credentialStatus === "expired" || entry.credentialStatus === "invalid",
    ).length,
    clientStatuses: clientStatuses.map((status) => ({
      ...status,
      clientName: clientsById.get(status.clientId)?.name ?? status.clientName,
    })),
  };
}
