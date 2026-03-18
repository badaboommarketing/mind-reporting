import test from "node:test";
import assert from "node:assert/strict";

import { prepareCsvImport } from "../src/importers/csv.js";

test("prepares Meta delivery CSV rows into snapshots and normalized fact candidates", () => {
  const csvText = [
    "occurred_at_utc,source_record_key,ad_id,ad_name,impressions,link_clicks,spend_amount,spend_currency",
    "2026-03-10T15:00:00.000Z,row-1,ad-123,SUV Promo,12000,240,550,CAD",
  ].join("\n");

  const result = prepareCsvImport({
    clientId: "client-1",
    reportingTimezone: "America/New_York",
    uploadType: "meta_delivery",
    csvText,
    fileName: "meta.csv",
  });

  assert.equal(result.rowCount, 1);
  assert.equal(result.rawSnapshots.length, 1);
  assert.equal(result.facts.length, 3);
  assert.equal(result.facts[0]?.dimensions.adId, "ad-123");
  assert.equal(result.facts.find((fact) => fact.factType === "ad_spend")?.currencyNative, "CAD");
});
