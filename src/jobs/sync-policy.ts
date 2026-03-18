import { DataSource } from "../domain/model.js";
import { monthDateRange } from "../domain/time.js";
import { round } from "../domain/utils.js";
import { SyncWindow } from "../integrations/contracts.js";

export function rollingSyncWindow(
  dataSource: DataSource,
  now = new Date(),
): SyncWindow {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - dataSource.rollingWindowDays);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    reason: "scheduled_rollforward",
  };
}

export function monthBackfillWindow(reportMonth: string): SyncWindow {
  const range = monthDateRange(reportMonth);
  return {
    startDate: range.start,
    endDate: range.end,
    reason: "backfill",
  };
}

export function retryDelayMs(retryCount: number, backoffBaseMs: number): number {
  return round(backoffBaseMs * 2 ** retryCount, 0);
}
