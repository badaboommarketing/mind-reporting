import { randomUUID } from "node:crypto";

import { parse } from "csv-parse/sync";

import { ReviewException, FxRate, NormalizedFact, RawSnapshot, UploadType } from "../domain/model.js";
import { AppError } from "../lib/errors.js";

interface ImportContext {
  clientId: string;
  reportingTimezone: string;
  uploadType: UploadType;
  csvText: string;
  fileName: string;
}

export interface CsvImportPayload {
  rowCount: number;
  rawSnapshots: RawSnapshot[];
  facts: NormalizedFact[];
  fxRates: FxRate[];
  exceptions: ReviewException[];
}

function parseRows(csvText: string): Array<Record<string, string>> {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;

  if (records.length === 0) {
    throw new AppError(400, "The CSV file is empty.");
  }

  return records;
}

function requireColumns(
  row: Record<string, string>,
  columns: string[],
  uploadType: UploadType,
) {
  for (const column of columns) {
    if (!(column in row)) {
      throw new AppError(400, `Missing required column "${column}" for ${uploadType}.`);
    }
  }
}

function asNumber(raw: string | undefined, field: string): number {
  const value = Number(raw ?? "");
  if (Number.isNaN(value)) {
    throw new AppError(400, `Field "${field}" must be a valid number.`);
  }
  return value;
}

function buildSnapshot(
  clientId: string,
  uploadType: UploadType,
  rowKey: string,
  payload: Record<string, string>,
): RawSnapshot {
  return {
    id: randomUUID(),
    clientId,
    source: uploadType === "meta_delivery"
      ? "meta_ads"
      : uploadType === "gohighlevel_funnel"
        ? "gohighlevel"
        : uploadType === "close_revenue"
          ? "close"
          : "manual_import",
    sourceRecordKey: rowKey,
    capturedAt: new Date().toISOString(),
    payload,
  };
}

function buildException(
  clientId: string,
  title: string,
  detail: string,
  reportMonth: string | null,
  type: ReviewException["type"] = "missing_mapping",
): ReviewException {
  return {
    id: randomUUID(),
    clientId,
    reportMonth,
    type,
    status: "open",
    title,
    detail,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function prepareCsvImport(context: ImportContext): CsvImportPayload {
  const rows = parseRows(context.csvText);

  if (context.uploadType === "fx_rates") {
    const fxRates: FxRate[] = rows.map((row) => {
      requireColumns(row, ["rate_date", "base_currency", "quote_currency", "rate"], context.uploadType);
      return {
        id: randomUUID(),
        rateDate: row.rate_date,
        baseCurrency: row.base_currency,
        quoteCurrency: row.quote_currency,
        rate: asNumber(row.rate, "rate"),
        source: `csv:${context.fileName}`,
      };
    });

    return {
      rowCount: rows.length,
      rawSnapshots: [],
      facts: [],
      fxRates,
      exceptions: [],
    };
  }

  const rawSnapshots: RawSnapshot[] = [];
  const facts: NormalizedFact[] = [];
  const exceptions: ReviewException[] = [];

  for (const [index, row] of rows.entries()) {
    requireColumns(row, ["occurred_at_utc", "source_record_key"], context.uploadType);
    const reportMonth = row.occurred_at_utc.slice(0, 7);
    const rowKey = row.source_record_key;
    const snapshot = buildSnapshot(context.clientId, context.uploadType, rowKey, row);
    rawSnapshots.push(snapshot);

    const commonDimensions = {
      campaignId: row.campaign_id || undefined,
      campaignName: row.campaign_name || undefined,
      adsetId: row.adset_id || undefined,
      adsetName: row.adset_name || undefined,
      adId: row.ad_id || undefined,
      adName: row.ad_name || undefined,
      funnelId: row.funnel_id || undefined,
      funnelName: row.funnel_name || undefined,
      formId: row.form_id || undefined,
      formName: row.form_name || undefined,
      calendarId: row.calendar_id || undefined,
      calendarName: row.calendar_name || undefined,
      pipelineId: row.pipeline_id || undefined,
      pipelineName: row.pipeline_name || undefined,
      stageId: row.stage_id || undefined,
      stageName: row.stage_name || undefined,
      opportunityId: row.opportunity_id || undefined,
      ownerId: row.owner_id || undefined,
      ownerName: row.owner_name || undefined,
      contactKey: row.contact_key || undefined,
      externalAttributionKey: row.external_attribution_key || undefined,
    };

    if (
      context.uploadType !== "meta_delivery" &&
      !commonDimensions.adId &&
      !commonDimensions.externalAttributionKey
    ) {
      exceptions.push(
        buildException(
          context.clientId,
          "Missing ad attribution mapping",
          `Row ${index + 2} in ${context.fileName} has no ad_id or external_attribution_key, so it can power month-level reporting but not resolved ad-level funnel attribution.`,
          reportMonth,
        ),
      );
    }

    const baseFact = {
      clientId: context.clientId,
      occurredAtUtc: row.occurred_at_utc,
      reportingTimezone: context.reportingTimezone,
      reportingDateLocal: row.occurred_at_utc.slice(0, 10),
      dimensions: commonDimensions,
      rawSnapshotId: snapshot.id,
      syncedAt: new Date().toISOString(),
      isDeleted: false,
    };

    if (context.uploadType === "meta_delivery") {
      requireColumns(
        row,
        ["impressions", "link_clicks", "spend_amount", "spend_currency"],
        context.uploadType,
      );

      facts.push(
        {
          ...baseFact,
          id: randomUUID(),
          source: "meta_ads",
          sourceRecordKey: rowKey,
          factType: "impressions",
          valueKind: "count",
          value: asNumber(row.impressions, "impressions"),
        },
        {
          ...baseFact,
          id: randomUUID(),
          source: "meta_ads",
          sourceRecordKey: rowKey,
          factType: "link_clicks",
          valueKind: "count",
          value: asNumber(row.link_clicks, "link_clicks"),
        },
        {
          ...baseFact,
          id: randomUUID(),
          source: "meta_ads",
          sourceRecordKey: rowKey,
          factType: "ad_spend",
          valueKind: "currency",
          value: asNumber(row.spend_amount, "spend_amount"),
          amountNative: asNumber(row.spend_amount, "spend_amount"),
          currencyNative: row.spend_currency,
        },
      );
      continue;
    }

    if (context.uploadType === "gohighlevel_funnel") {
      requireColumns(row, ["lead_count", "strategy_calls", "triage_calls"], context.uploadType);
      facts.push(
        {
          ...baseFact,
          id: randomUUID(),
          source: "gohighlevel",
          sourceRecordKey: rowKey,
          factType: "lead",
          valueKind: "count",
          value: asNumber(row.lead_count, "lead_count"),
        },
        {
          ...baseFact,
          id: randomUUID(),
          source: "gohighlevel",
          sourceRecordKey: rowKey,
          factType: "strategy_call",
          valueKind: "count",
          value: asNumber(row.strategy_calls, "strategy_calls"),
        },
        {
          ...baseFact,
          id: randomUUID(),
          source: "gohighlevel",
          sourceRecordKey: rowKey,
          factType: "triage_call",
          valueKind: "count",
          value: asNumber(row.triage_calls, "triage_calls"),
        },
      );
      continue;
    }

    if (context.uploadType === "close_revenue") {
      requireColumns(
        row,
        ["new_clients", "revenue_booked", "revenue_collected", "revenue_currency"],
        context.uploadType,
      );
      facts.push(
        {
          ...baseFact,
          id: randomUUID(),
          source: "close",
          sourceRecordKey: rowKey,
          factType: "new_client",
          valueKind: "count",
          value: asNumber(row.new_clients, "new_clients"),
        },
        {
          ...baseFact,
          id: randomUUID(),
          source: "close",
          sourceRecordKey: rowKey,
          factType: "revenue_booked",
          valueKind: "currency",
          value: asNumber(row.revenue_booked, "revenue_booked"),
          amountNative: asNumber(row.revenue_booked, "revenue_booked"),
          currencyNative: row.revenue_currency,
        },
        {
          ...baseFact,
          id: randomUUID(),
          source: "close",
          sourceRecordKey: rowKey,
          factType: "revenue_collected",
          valueKind: "currency",
          value: asNumber(row.revenue_collected, "revenue_collected"),
          amountNative: asNumber(row.revenue_collected, "revenue_collected"),
          currencyNative: row.revenue_currency,
        },
      );
    }
  }

  return {
    rowCount: rows.length,
    rawSnapshots,
    facts,
    fxRates: [],
    exceptions,
  };
}
