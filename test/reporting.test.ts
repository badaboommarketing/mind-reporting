import test from "node:test";
import assert from "node:assert/strict";

import { createStore } from "../src/app/store.js";
import { getPerformanceReport, getScorecardReport } from "../src/domain/reporting.js";

test("resolves monthly scorecard values using source precedence and FX normalization", () => {
  const store = createStore();
  const report = getScorecardReport(store, "client-bada-auto", "2026-03", new Date("2026-03-18T12:00:00.000Z"));

  const leads = report.metrics.find((metric) => metric.metricKey === "leads");
  const spend = report.metrics.find((metric) => metric.metricKey === "total_spend");
  const revenueCollected = report.metrics.find((metric) => metric.metricKey === "new_revenue_collected");
  const monthlyRoas = report.metrics.find((metric) => metric.metricKey === "monthly_roas");
  const costPerLead = report.metrics.find((metric) => metric.metricKey === "cost_per_lead");

  assert.equal(leads?.resolved.monthlyActual, 92);
  assert.equal(leads?.resolvedSource, "gohighlevel");
  assert.equal(spend?.resolved.monthlyActual, 2994.9);
  assert.equal(revenueCollected?.resolved.monthlyActual, 33500);
  assert.equal(monthlyRoas?.resolved.monthlyActual, 11.1857);
  assert.equal(costPerLead?.resolved.monthlyActual, 32.5533);
});

test("builds multiple ad-level performance report shapes from the same fact set", () => {
  const store = createStore();
  const deliveryReport = getPerformanceReport(store, "client-bada-auto", "2026-03", "meta_delivery");
  const funnelReport = getPerformanceReport(store, "client-bada-auto", "2026-03", "meta_funnel");

  const adOneDelivery = deliveryReport.rows.find((row) => row.adId === "ad-1");
  const adOneFunnel = funnelReport.rows.find((row) => row.adId === "ad-1");

  assert.deepEqual(deliveryReport.definition.metrics, [
    "impressions",
    "link_clicks",
    "ctr",
    "cpm",
    "total_spend",
  ]);
  assert.equal(adOneDelivery?.values.impressions, 44000);
  assert.equal(adOneDelivery?.values.ctr, 0.03);
  assert.equal(adOneDelivery?.values.cpm, 36.5);

  assert.deepEqual(funnelReport.definition.metrics, [
    "leads",
    "cost_per_lead",
    "calls",
    "cost_per_call",
    "new_clients",
    "cost_per_new_client",
  ]);
  assert.equal(adOneFunnel?.values.leads, 52);
  assert.equal(adOneFunnel?.values.calls, 30);
  assert.equal(adOneFunnel?.values.cost_per_call, 53.5333);
  assert.equal(adOneFunnel?.values.cost_per_new_client, 229.4286);
});

test("surfaces drift when a locked month no longer matches live facts", () => {
  const store = createStore();
  const report = getScorecardReport(store, "client-bada-auto", "2026-02");

  assert.equal(report.isLocked, true);
  const drift = report.openExceptions.find((entry) => entry.type === "post_lock_drift");
  assert.ok(drift);
  assert.match(drift.detail, /Published value 9500 differs from live value 11000/);
});
