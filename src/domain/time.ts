import { WeekBucket } from "./model.js";

const WEEK_BUCKETS: WeekBucket[] = ["1-7", "8-14", "15-21", "22-28", "29-EOM"];

export function weekBuckets(): WeekBucket[] {
  return [...WEEK_BUCKETS];
}

export function toReportingDate(occurredAtUtc: string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date(occurredAtUtc));
}

export function getWeekBucket(reportingDateLocal: string): WeekBucket {
  const day = Number(reportingDateLocal.slice(8, 10));
  if (day <= 7) {
    return "1-7";
  }
  if (day <= 14) {
    return "8-14";
  }
  if (day <= 21) {
    return "15-21";
  }
  if (day <= 28) {
    return "22-28";
  }
  return "29-EOM";
}

export function daysInMonth(reportMonth: string): number {
  const [year, month] = reportMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function elapsedReportingDays(
  reportMonth: string,
  timezone: string,
  now = new Date(),
): number {
  const currentReportingDate = toReportingDate(now.toISOString(), timezone);
  const currentMonth = currentReportingDate.slice(0, 7);
  const totalDays = daysInMonth(reportMonth);

  if (currentMonth < reportMonth) {
    return 0;
  }
  if (currentMonth > reportMonth) {
    return totalDays;
  }

  const day = Number(currentReportingDate.slice(8, 10));
  return Math.min(Math.max(day, 0), totalDays);
}

export function monthDateRange(reportMonth: string): { start: string; end: string } {
  const totalDays = daysInMonth(reportMonth);
  return {
    start: `${reportMonth}-01`,
    end: `${reportMonth}-${String(totalDays).padStart(2, "0")}`,
  };
}

export function isInMonth(reportingDateLocal: string, reportMonth: string): boolean {
  return reportingDateLocal.startsWith(reportMonth);
}
