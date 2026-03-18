import { randomUUID } from "node:crypto";

import { getPool } from "../db/pool.js";
import { loadConfig } from "../config.js";

async function main() {
  const config = loadConfig();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const adminId = "seed-admin-user";
    await client.query(
      `insert into app_users (id, name, email, is_platform_admin)
       values ($1, $2, $3, true)
       on conflict (id)
       do update set name = excluded.name, email = excluded.email, is_platform_admin = true`,
      [adminId, config.seedAdminName, config.seedAdminEmail],
    );

    const demoClientId = "seed-demo-client";
    await client.query(
      `insert into clients (
        id, name, reporting_timezone, reporting_currency, spend_basis, lead_definition,
        new_client_definition, pipeline_mappings, booking_mappings, revenue_mappings,
        duplicate_rules, manual_import_sources, onboarding_completed_at
      ) values (
        $1, 'Demo Dealership', 'America/New_York', 'USD', 'gross',
        'A valid inbound lead accepted by the sales team.',
        'A won Close opportunity with a valid delivery date.',
        '{"notes":["Map won stages here."]}'::jsonb,
        '{"notes":["Map strategy and triage calls here."]}'::jsonb,
        '{"notes":"Map booked and collected revenue fields here."}'::jsonb,
        ARRAY['Exact normalized email wins when unique.', 'Exact phone wins when unique.'],
        ARRAY['offline_call_center'],
        now()
      )
      on conflict (id) do nothing`,
      [demoClientId],
    );

    await client.query(
      `insert into client_memberships (client_id, user_id, role)
       values ($1, $2, 'agency_admin')
       on conflict (client_id, user_id) do nothing`,
      [demoClientId, adminId],
    );

    const metricTargets = [
      ["new_clients", 20],
      ["leads", 180],
      ["strategy_calls", 55],
      ["triage_calls", 38],
      ["total_spend", 13500],
      ["new_revenue_booked", 95000],
      ["new_revenue_collected", 76000],
    ];
    for (const [metricKey, target] of metricTargets) {
      await client.query(
        `insert into metric_targets (client_id, metric_key, target, owner_user_id)
         values ($1, $2, $3, $4)
         on conflict (client_id, metric_key)
         do update set target = excluded.target, owner_user_id = excluded.owner_user_id`,
        [demoClientId, metricKey, target, adminId],
      );
    }

    const sourceRules = [
      ["total_spend", ["meta_ads", "manual_import", "gohighlevel", "close"]],
      ["leads", ["gohighlevel", "manual_import", "meta_ads", "close"]],
      ["strategy_calls", ["gohighlevel", "manual_import", "close", "meta_ads"]],
      ["triage_calls", ["gohighlevel", "manual_import", "close", "meta_ads"]],
      ["new_clients", ["close", "manual_import", "meta_ads", "gohighlevel"]],
      ["new_revenue_booked", ["close", "manual_import", "gohighlevel", "meta_ads"]],
      ["new_revenue_collected", ["close", "manual_import", "gohighlevel", "meta_ads"]],
    ];
    for (const [metricKey, sourcePriority] of sourceRules) {
      await client.query(
        `insert into metric_source_rules (client_id, metric_key, source_priority, fallback_to_manual_import)
         values ($1, $2, $3, true)
         on conflict (client_id, metric_key)
         do update set source_priority = excluded.source_priority`,
        [demoClientId, metricKey, sourcePriority],
      );
    }

    const dataSources = [
      ["meta_ads", "Meta CSV Uploads"],
      ["gohighlevel", "GoHighLevel CSV Uploads"],
      ["close", "Close CSV Uploads"],
      ["manual_import", "Manual Adjustments"],
    ] as const;

    for (const [source, label] of dataSources) {
      await client.query(
        `insert into data_sources (
          id, client_id, source, display_name, account_currency, credential_status, secret_ref,
          expected_max_lag_minutes, sync_mode, rolling_window_days, requests_per_minute, burst_limit,
          backoff_base_ms, health, retry_count
        ) values ($1, $2, $3, $4, 'USD', 'healthy', 'csv-only', 1440, 'manual_only', 0, 0, 0, 0, 'manual', 0)
        on conflict (id) do nothing`,
        [`seed-${demoClientId}-${source}`, demoClientId, source, label],
      );
    }

    await client.query("commit");
    console.log(`Seeded admin ${config.seedAdminEmail} and demo client.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
