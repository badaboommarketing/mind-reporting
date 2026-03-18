import test from "node:test";
import assert from "node:assert/strict";

import { rollingSyncWindow, retryDelayMs } from "../src/jobs/sync-policy.js";
import { createSeedStore } from "../src/app/seed.js";

test("builds rolling sync windows from connector settings", () => {
  const store = createSeedStore();
  const metaSource = store.dataSources.find((entry) => entry.source === "meta_ads");
  assert.ok(metaSource);

  const window = rollingSyncWindow(metaSource, new Date("2026-03-18T12:00:00.000Z"));

  assert.equal(window.startDate, "2026-02-16");
  assert.equal(window.endDate, "2026-03-18");
  assert.equal(window.reason, "scheduled_rollforward");
});

test("uses exponential retry delay for rate-limit/backoff policy", () => {
  assert.equal(retryDelayMs(0, 1000), 1000);
  assert.equal(retryDelayMs(3, 1000), 8000);
});
