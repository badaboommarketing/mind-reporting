import { METRIC_DEFINITIONS, PERFORMANCE_REPORT_DEFINITIONS } from "../domain/metrics.js";
import {
  ManualImportBatch,
  MetricKey,
  ReviewException,
  ScorecardReport,
  PerformanceReport,
  User,
  UploadType,
  Client,
} from "../domain/model.js";
import { MissionControlSummary } from "../domain/model.js";

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badge(value: string): string {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  return `<span class="badge ${normalized}">${escapeHtml(value)}</span>`;
}

function navLink(href: string, label: string, currentPath: string): string {
  const active = currentPath === href ? "active" : "";
  return `<a class="${active}" href="${href}">${escapeHtml(label)}</a>`;
}

export function monthOptions(currentMonth: string): string[] {
  const base = new Date(`${currentMonth}-01T00:00:00.000Z`);
  const months: string[] = [];
  for (let offset = -2; offset <= 2; offset += 1) {
    const next = new Date(base);
    next.setUTCMonth(base.getUTCMonth() + offset);
    months.push(next.toISOString().slice(0, 7));
  }
  return months;
}

export function formatValue(value: number | null, currency?: string): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (currency) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value);
}

function layout(input: {
  title: string;
  currentPath: string;
  user: User | null;
  clients: Client[];
  content: string;
  notice?: string | null;
  appMode: "demo" | "database";
}): string {
  if (!input.user) {
    return `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(input.title)}</title>
          <link rel="stylesheet" href="/assets/app.css" />
        </head>
        <body>${input.content}</body>
      </html>`;
  }

  const clientLinks = input.clients
    .map((client) =>
      `<a href="/app/clients/${client.id}/reports/${new Date().toISOString().slice(0, 7)}">${escapeHtml(client.name)}</a>`,
    )
    .join("");

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(input.title)}</title>
        <link rel="stylesheet" href="/assets/app.css" />
      </head>
      <body>
        <div class="shell">
          <aside class="sidebar">
            <div class="brand">MIND<small>Trust-First Reporting</small></div>
            <div class="nav">
              ${navLink("/app/mission-control", "Mission Control", input.currentPath)}
              ${navLink("/app/clients/new", "Onboard Client", input.currentPath)}
              <div class="small">Clients</div>
              ${clientLinks || '<div class="small">No clients yet.</div>'}
              <form method="post" action="/logout"><button type="submit" class="secondary">Sign Out</button></form>
            </div>
            <p class="footer-note">Mode: ${escapeHtml(input.appMode)}</p>
          </aside>
          <main class="main">
            ${input.notice ? `<div class="notice success">${escapeHtml(input.notice)}</div>` : ""}
            ${input.content}
          </main>
        </div>
      </body>
    </html>`;
}

export function renderLoginPage(input: {
  message?: string | null;
  appMode: "demo" | "database";
  googleEnabled: boolean;
}): string {
  return layout({
    title: "Login",
    currentPath: "/login",
    user: null,
    clients: [],
    appMode: input.appMode,
    content: `<div class="login-shell">
      <div class="card login-card">
        <div class="hero">
          <div>
            <h1>Internal Reporting MVP</h1>
            <p>Sign in with your Bada Google account to access client scorecards, CSV uploads, performance reports, and exceptions.</p>
          </div>
        </div>
        ${input.message ? `<div class="notice error">${escapeHtml(input.message)}</div>` : ""}
        <div class="stack">
          ${
            input.googleEnabled
              ? `<a class="button" href="/auth/google">Continue with Google Workspace</a>`
              : `<div class="notice error">Google OAuth is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before using live login.</div>`
          }
          ${
            input.appMode === "demo"
              ? `<form method="post" action="/demo/login"><button type="submit" class="secondary">Enter Demo Mode</button></form>`
              : ""
          }
        </div>
        <p class="footer-note">This app is internal-only. Allowed domain access is restricted to your agency domain.</p>
      </div>
    </div>`,
  });
}

export function renderMissionControlPage(input: {
  user: User;
  clients: Client[];
  summary: MissionControlSummary;
  currentPath: string;
  notice?: string | null;
  appMode: "demo" | "database";
}): string {
  return layout({
    title: "Mission Control",
    currentPath: input.currentPath,
    user: input.user,
    clients: input.clients,
    notice: input.notice,
    appMode: input.appMode,
    content: `
      <section class="hero">
        <div>
          <h1>Mission Control</h1>
          <p>Start here each morning. This is the agency-wide health view for open exceptions, locked-report drift, and client readiness.</p>
        </div>
        <div class="pill-row">
          <span class="pill">Open exceptions: <strong>${input.summary.openExceptionCount}</strong></span>
          <span class="pill">Drifted locked reports: <strong>${input.summary.driftedLockedReportCount}</strong></span>
          <span class="pill">Broken connectors: <strong>${input.summary.brokenConnectorCount}</strong></span>
        </div>
      </section>

      <div class="grid three">
        <div class="card"><h3>Open Exceptions</h3><div class="metric-value">${input.summary.openExceptionCount}</div></div>
        <div class="card"><h3>Locked Drift</h3><div class="metric-value">${input.summary.driftedLockedReportCount}</div></div>
        <div class="card"><h3>Expired Credentials</h3><div class="metric-value">${input.summary.expiredCredentialCount}</div></div>
      </div>

      <div class="card" style="margin-top: 18px;">
        <h2>Clients</h2>
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Open Exceptions</th>
              <th>Locked Drift</th>
              <th>Broken Connectors</th>
              <th>Next Step</th>
            </tr>
          </thead>
          <tbody>
            ${input.summary.clientStatuses
              .map(
                (status) => `
                <tr>
                  <td>${escapeHtml(status.clientName)}</td>
                  <td>${status.openExceptions}</td>
                  <td>${status.lockedReportsWithDrift}</td>
                  <td>${status.brokenConnectors}</td>
                  <td><a class="button secondary" href="/app/clients/${status.clientId}/reports/${new Date().toISOString().slice(0, 7)}">Open Scorecard</a></td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>`,
  });
}

export function renderClientOnboardingPage(input: {
  user: User;
  clients: Client[];
  clientUsers: User[];
  currentPath: string;
  notice?: string | null;
  error?: string | null;
  appMode: "demo" | "database";
}): string {
  const targetInputs = METRIC_DEFINITIONS.filter((metric) => metric.targetable)
    .map(
      (metric) => `
        <label>${escapeHtml(metric.label)}
          <input type="number" step="0.01" name="target_${metric.key}" />
        </label>`,
    )
    .join("");

  const ruleInputs = [
    "total_spend",
    "leads",
    "strategy_calls",
    "triage_calls",
    "new_clients",
    "new_revenue_booked",
    "new_revenue_collected",
  ]
    .map((metricKey) => {
      const metric = METRIC_DEFINITIONS.find((entry) => entry.key === metricKey)!;
      return `<label>${escapeHtml(metric.label)}
        <select name="source_${metricKey}">
          <option value="meta_ads">Meta</option>
          <option value="gohighlevel">GoHighLevel</option>
          <option value="close">Close</option>
          <option value="manual_import">Manual Import</option>
        </select>
      </label>`;
    })
    .join("");

  return layout({
    title: "Onboard Client",
    currentPath: input.currentPath,
    user: input.user,
    clients: input.clients,
    notice: input.notice,
    appMode: input.appMode,
    content: `
      <section class="hero">
        <div>
          <h1>Onboard a Client</h1>
          <p>Use this once per client. The goal is to lock the reporting rules before any data is uploaded.</p>
        </div>
      </section>
      ${input.error ? `<div class="notice error">${escapeHtml(input.error)}</div>` : ""}
      <form method="post" action="/app/clients" class="stack">
        <div class="card">
          <h2>Core Setup</h2>
          <div class="stack two">
            <label>Client name<input name="name" required /></label>
            <label>Reporting timezone<input name="reportingTimezone" value="America/New_York" required /></label>
            <label>Reporting currency<input name="reportingCurrency" value="USD" required /></label>
            <label>Spend basis
              <select name="spendBasis">
                <option value="gross">Gross</option>
                <option value="net">Net</option>
              </select>
            </label>
            <label>Default metric owner
              <select name="defaultOwnerUserId">
                <option value="">None</option>
                ${input.clientUsers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="stack two">
            <label>Lead definition<textarea name="leadDefinition" required>A lead is a valid inbound prospect accepted by the sales team.</textarea></label>
            <label>New-client definition<textarea name="newClientDefinition" required>A new client is a Close opportunity that reaches won with a valid delivery date.</textarea></label>
          </div>
        </div>

        <div class="card">
          <h2>Mapping Notes</h2>
          <div class="stack two">
            <label>Pipeline mapping notes<textarea name="pipelineMappingNotes" required>Close pipeline stages that count as won, booked, and excluded.</textarea></label>
            <label>Booking mapping notes<textarea name="bookingMappingNotes" required>How strategy calls and triage calls are named in the client stack.</textarea></label>
            <label>Revenue mapping notes<textarea name="revenueMappingNotes" required>Which fields represent booked and collected revenue.</textarea></label>
            <label>Duplicate rules<textarea name="duplicateRules" required>Exact normalized email wins when unique.
Exact E.164 phone wins when unique.
Ambiguous overlaps create exceptions.</textarea></label>
          </div>
          <label>Manual import sources<textarea name="manualImportSources">offline_call_center</textarea></label>
        </div>

        <div class="card">
          <h2>Targets</h2>
          <div class="stack two">${targetInputs}</div>
        </div>

        <div class="card">
          <h2>Source-of-Truth Rules</h2>
          <div class="stack two">${ruleInputs}</div>
        </div>

        <button type="submit">Create Client</button>
      </form>`,
  });
}

function uploadCard(clientId: string, uploadType: UploadType, label: string, columns: string[]): string {
  return `<div class="card">
    <h3>${escapeHtml(label)}</h3>
    <p class="meta-line">Required columns: ${escapeHtml(columns.join(", "))}</p>
    <form method="post" action="/app/clients/${clientId}/uploads/${uploadType}" enctype="multipart/form-data" class="stack">
      <label>CSV file<input type="file" name="csvFile" accept=".csv,text/csv" required /></label>
      <button type="submit">Upload ${escapeHtml(label)}</button>
    </form>
  </div>`;
}

export function renderUploadsPage(input: {
  user: User;
  clients: Client[];
  client: Client;
  batches: ManualImportBatch[];
  currentPath: string;
  notice?: string | null;
  error?: string | null;
  appMode: "demo" | "database";
}): string {
  return layout({
    title: "CSV Uploads",
    currentPath: input.currentPath,
    user: input.user,
    clients: input.clients,
    notice: input.notice,
    appMode: input.appMode,
    content: `
      <section class="hero">
        <div>
          <h1>${escapeHtml(input.client.name)} Uploads</h1>
          <p>CSV uploads are the first live data path for this MVP. Every batch is tracked and every import is auditable.</p>
        </div>
        <div class="pill-row">
          <a class="button secondary" href="/app/clients/${input.client.id}/reports/${new Date().toISOString().slice(0, 7)}">Open Scorecard</a>
        </div>
      </section>
      ${input.error ? `<div class="notice error">${escapeHtml(input.error)}</div>` : ""}
      <div class="grid two">
        ${uploadCard(input.client.id, "meta_delivery", "Meta Spend + Delivery", [
          "occurred_at_utc",
          "source_record_key",
          "ad_id",
          "impressions",
          "link_clicks",
          "spend_amount",
          "spend_currency",
        ])}
        ${uploadCard(input.client.id, "gohighlevel_funnel", "GoHighLevel Leads + Calls", [
          "occurred_at_utc",
          "source_record_key",
          "lead_count",
          "strategy_calls",
          "triage_calls",
          "ad_id or external_attribution_key",
        ])}
        ${uploadCard(input.client.id, "close_revenue", "Close Deals + Revenue", [
          "occurred_at_utc",
          "source_record_key",
          "new_clients",
          "revenue_booked",
          "revenue_collected",
          "revenue_currency",
          "ad_id or external_attribution_key",
        ])}
        ${uploadCard(input.client.id, "fx_rates", "FX Rates", [
          "rate_date",
          "base_currency",
          "quote_currency",
          "rate",
        ])}
      </div>
      <div class="card" style="margin-top: 18px;">
        <h2>Recent Uploads</h2>
        <table>
          <thead><tr><th>When</th><th>Type</th><th>File</th><th>Rows</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            ${input.batches
              .map(
                (batch) => `
                  <tr>
                    <td>${escapeHtml(batch.createdAt)}</td>
                    <td>${escapeHtml(batch.uploadType)}</td>
                    <td>${escapeHtml(batch.fileName)}</td>
                    <td>${batch.rowCount}</td>
                    <td>${badge(batch.status)}</td>
                    <td>${escapeHtml(batch.notes || "—")}</td>
                  </tr>`,
              )
              .join("") || '<tr><td colspan="6">No uploads yet.</td></tr>'}
          </tbody>
        </table>
      </div>`,
  });
}

export function renderScorecardPage(input: {
  user: User;
  clients: Client[];
  client: Client;
  report: ScorecardReport;
  reportMonth: string;
  currentPath: string;
  clientUsers: User[];
  notice?: string | null;
  error?: string | null;
  appMode: "demo" | "database";
}): string {
  const monthNav = monthOptions(input.reportMonth)
    .map(
      (month) =>
        `<a class="button ${month === input.reportMonth ? "" : "secondary"}" href="/app/clients/${input.client.id}/reports/${month}">${month}</a>`,
    )
    .join("");

  const metricsHtml = input.report.metrics
    .map((metric) => {
      const sourceBoxes = Object.entries(metric.sourceNative)
        .map(
          ([source, valueSet]) => `<div class="source-box"><strong>${escapeHtml(source)}</strong><span>${formatValue(valueSet?.monthlyActual ?? null, metric.metricKey.includes("revenue") || metric.metricKey.includes("spend") || metric.metricKey.includes("cost_") || metric.metricKey.includes("margin") ? input.report.reportCurrency : undefined)}</span></div>`,
        )
        .join("");

      return `<div class="metric-row">
        <div class="metric-head">
          <div>
            <div class="metric-name">${escapeHtml(metric.label)}</div>
            <div class="meta-line">Resolved from ${escapeHtml(metric.resolvedSource ?? "none")} • quality ${badge(metric.qualityState)}</div>
          </div>
          <div class="metric-value">${formatValue(metric.resolved.monthlyActual, metric.metricKey.includes("revenue") || metric.metricKey.includes("spend") || metric.metricKey.includes("cost_") || metric.metricKey.includes("margin") ? input.report.reportCurrency : undefined)}</div>
        </div>
        <div class="source-strip">${sourceBoxes}</div>
        <div class="pill-row" style="margin-bottom: 14px;">
          <span class="pill">Target: ${formatValue(metric.target, metric.metricKey.includes("revenue") || metric.metricKey.includes("spend") || metric.metricKey.includes("cost_") || metric.metricKey.includes("margin") ? input.report.reportCurrency : undefined)}</span>
          <span class="pill">Projected pace: ${formatValue(metric.paceProjection, metric.metricKey.includes("revenue") || metric.metricKey.includes("spend") || metric.metricKey.includes("cost_") || metric.metricKey.includes("margin") ? input.report.reportCurrency : undefined)}</span>
          <span class="pill">Pace %: ${formatValue(metric.pacePercent)}</span>
          ${badge(metric.status)}
        </div>
        <form method="post" action="/app/clients/${input.client.id}/reports/${input.reportMonth}/annotations" class="stack">
          <input type="hidden" name="metricKey" value="${metric.metricKey}" />
          <div class="stack two">
            <label>Status
              <select name="status">
                ${["select_status", "yellow", "green", "red", "light_green", "light_red"]
                  .map((status) => `<option value="${status}" ${metric.status === status ? "selected" : ""}>${status}</option>`)
                  .join("")}
              </select>
            </label>
            <label>Owner
              <select name="ownerUserId">
                <option value="">None</option>
                ${input.clientUsers
                  .map((user) => `<option value="${user.id}" ${metric.ownerUserId === user.id ? "selected" : ""}>${escapeHtml(user.name)}</option>`)
                  .join("")}
              </select>
            </label>
          </div>
          <div class="stack two">
            <label>Source note<textarea name="sourceNote">${escapeHtml(metric.sourceNote ?? "")}</textarea></label>
            <label>Risk note<textarea name="riskNote">${escapeHtml(metric.riskNote ?? "")}</textarea></label>
          </div>
          <div class="stack two">
            <label>Manual override value<input type="number" step="0.01" name="manualOverrideValue" value="${metric.manualOverrideValue ?? ""}" /></label>
            <label>Override reason<input name="overrideReason" value="" /></label>
          </div>
          <button type="submit">Save ${escapeHtml(metric.label)}</button>
        </form>
      </div>`;
    })
    .join("");

  return layout({
    title: `${input.client.name} Scorecard`,
    currentPath: input.currentPath,
    user: input.user,
    clients: input.clients,
    notice: input.notice,
    appMode: input.appMode,
    content: `
      <section class="hero">
        <div>
          <h1>${escapeHtml(input.client.name)} Scorecard</h1>
          <p>This is the resolved monthly operating view. Source-native numbers stay visible so the team can explain every metric.</p>
        </div>
        <div class="pill-row">
          ${monthNav}
          <a class="button secondary" href="/app/clients/${input.client.id}/performance/meta_delivery?month=${input.reportMonth}">Ad Reports</a>
          <a class="button secondary" href="/app/clients/${input.client.id}/uploads">Uploads</a>
          <a class="button secondary" href="/app/clients/${input.client.id}/exceptions?month=${input.reportMonth}">Exceptions (${input.report.openExceptions.length})</a>
        </div>
      </section>
      ${input.error ? `<div class="notice error">${escapeHtml(input.error)}</div>` : ""}
      <div class="card" style="margin-bottom: 18px;">
        <div class="pill-row">
          <span class="pill">Client timezone: ${escapeHtml(input.report.reportTimezone)}</span>
          <span class="pill">Reporting currency: ${escapeHtml(input.report.reportCurrency)}</span>
          <span class="pill">Locked: ${input.report.isLocked ? "Yes" : "No"}</span>
        </div>
        <div class="pill-row" style="margin-top: 12px;">
          <form method="post" action="/app/clients/${input.client.id}/reports/${input.reportMonth}/lock"><button type="submit">Lock Month</button></form>
          <form method="post" action="/app/clients/${input.client.id}/reports/${input.reportMonth}/unlock"><button type="submit" class="secondary">Unlock Latest Version</button></form>
        </div>
      </div>
      <div class="metric-grid">${metricsHtml}</div>`,
  });
}

export function renderPerformancePage(input: {
  user: User;
  clients: Client[];
  client: Client;
  report: PerformanceReport;
  reportMonth: string;
  currentPath: string;
  appMode: "demo" | "database";
}): string {
  const reportLinks = PERFORMANCE_REPORT_DEFINITIONS.map(
    (definition) =>
      `<a class="button ${definition.key === input.report.definition.key ? "" : "secondary"}" href="/app/clients/${input.client.id}/performance/${definition.key}?month=${input.reportMonth}">${escapeHtml(definition.label)}</a>`,
  ).join("");

  const valueHeaders = input.report.definition.metrics
    .map((metric) => `<th>${escapeHtml(metric)}</th>`)
    .join("");
  const valueRows = input.report.rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.campaignName ?? "—")}</td>
        <td>${escapeHtml(row.adsetName ?? "—")}</td>
        <td>${escapeHtml(row.adName)}</td>
        ${input.report.definition.metrics
          .map((metric) => `<td>${formatValue(row.values[metric] ?? null, metric.includes("revenue") || metric.includes("spend") || metric.includes("cost_") || metric.includes("margin") ? input.report.currency : undefined)}</td>`)
          .join("")}
      </tr>`,
    )
    .join("");

  return layout({
    title: `${input.client.name} Performance Report`,
    currentPath: input.currentPath,
    user: input.user,
    clients: input.clients,
    appMode: input.appMode,
    content: `
      <section class="hero">
        <div>
          <h1>${escapeHtml(input.report.definition.label)}</h1>
          <p>${escapeHtml(input.report.definition.description)}</p>
        </div>
        <div class="pill-row">
          ${reportLinks}
          <a class="button secondary" href="/app/clients/${input.client.id}/reports/${input.reportMonth}">Back to Scorecard</a>
        </div>
      </section>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Ad Set</th>
              <th>Ad</th>
              ${valueHeaders}
            </tr>
          </thead>
          <tbody>
            ${valueRows || '<tr><td colspan="99">No ad-level rows available for this report and month.</td></tr>'}
          </tbody>
        </table>
      </div>`,
  });
}

export function renderExceptionsPage(input: {
  user: User;
  clients: Client[];
  client: Client;
  exceptions: ReviewException[];
  reportMonth: string;
  currentPath: string;
  appMode: "demo" | "database";
}): string {
  return layout({
    title: `${input.client.name} Exceptions`,
    currentPath: input.currentPath,
    user: input.user,
    clients: input.clients,
    appMode: input.appMode,
    content: `
      <section class="hero">
        <div>
          <h1>${escapeHtml(input.client.name)} Exceptions</h1>
          <p>Anything unresolved lives here. Do not hide mismatches; resolve them or document why they are acceptable.</p>
        </div>
        <div class="pill-row">
          <a class="button secondary" href="/app/clients/${input.client.id}/reports/${input.reportMonth}">Back to Scorecard</a>
        </div>
      </section>
      <div class="grid">
        ${input.exceptions
          .map(
            (exception) => `
              <div class="card">
                <div class="metric-head">
                  <div>
                    <div class="metric-name">${escapeHtml(exception.title)}</div>
                    <div class="meta-line">${escapeHtml(exception.type)} • ${escapeHtml(exception.reportMonth ?? "global")}</div>
                  </div>
                  ${badge(exception.status)}
                </div>
                <p>${escapeHtml(exception.detail)}</p>
                <form method="post" action="/app/exceptions/${exception.id}/resolve" class="stack two">
                  <label>Status
                    <select name="status">
                      ${["open", "dismissed", "resolved_by_override", "resolved_by_mapping_change", "reopened"]
                        .map((status) => `<option value="${status}" ${exception.status === status ? "selected" : ""}>${status}</option>`)
                        .join("")}
                    </select>
                  </label>
                  <label>&nbsp;<button type="submit">Update Exception</button></label>
                </form>
              </div>`,
          )
          .join("") || '<div class="card">No open exceptions.</div>'}
      </div>`,
  });
}
