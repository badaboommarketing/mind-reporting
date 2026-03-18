import test from "node:test";
import assert from "node:assert/strict";

import { daysInMonth, elapsedReportingDays, getWeekBucket, toReportingDate } from "../src/domain/time.js";

test("converts UTC timestamps into the client reporting timezone", () => {
  const reportingDate = toReportingDate("2026-03-03T04:45:00.000Z", "America/New_York");
  assert.equal(reportingDate, "2026-03-02");
});

test("buckets late-month days into 29-EOM", () => {
  assert.equal(getWeekBucket("2026-03-29"), "29-EOM");
  assert.equal(getWeekBucket("2026-02-28"), "22-28");
});

test("calculates elapsed reporting days inside a target month", () => {
  const now = new Date("2026-03-18T12:00:00.000Z");
  assert.equal(elapsedReportingDays("2026-03", "America/New_York", now), 18);
  assert.equal(daysInMonth("2026-02"), 28);
});
