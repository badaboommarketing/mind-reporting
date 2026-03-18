import {
  MetricKey,
  PerformanceReportDefinition,
  ScorecardSection,
  SourcePlatform,
} from "./model.js";

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  section: ScorecardSection;
  kind: "base" | "derived";
  sourceFactType?: string;
  sourcePriority: SourcePlatform[];
  targetable: boolean;
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: "new_clients",
    label: "New Clients",
    section: "most_important_number",
    kind: "base",
    sourceFactType: "new_client",
    sourcePriority: ["close", "manual_import", "meta_ads", "gohighlevel"],
    targetable: true,
  },
  {
    key: "cost_per_new_client",
    label: "Cost Per New Client",
    section: "most_important_number",
    kind: "derived",
    sourcePriority: ["meta_ads", "close", "manual_import", "gohighlevel"],
    targetable: true,
  },
  {
    key: "strategy_calls",
    label: "Strategy Calls",
    section: "most_important_number",
    kind: "base",
    sourceFactType: "strategy_call",
    sourcePriority: ["gohighlevel", "manual_import", "close", "meta_ads"],
    targetable: true,
  },
  {
    key: "cost_per_strategy_call",
    label: "Cost Per Strategy Call",
    section: "most_important_number",
    kind: "derived",
    sourcePriority: ["meta_ads", "gohighlevel", "manual_import", "close"],
    targetable: true,
  },
  {
    key: "triage_calls",
    label: "Triage Calls (Demo)",
    section: "most_important_number",
    kind: "base",
    sourceFactType: "triage_call",
    sourcePriority: ["gohighlevel", "manual_import", "close", "meta_ads"],
    targetable: true,
  },
  {
    key: "cost_per_triage_call",
    label: "Cost Per Triage Call (Demo)",
    section: "most_important_number",
    kind: "derived",
    sourcePriority: ["meta_ads", "gohighlevel", "manual_import", "close"],
    targetable: true,
  },
  {
    key: "leads",
    label: "Leads",
    section: "most_important_number",
    kind: "base",
    sourceFactType: "lead",
    sourcePriority: ["gohighlevel", "manual_import", "meta_ads", "close"],
    targetable: true,
  },
  {
    key: "cost_per_lead",
    label: "Cost Per Lead",
    section: "most_important_number",
    kind: "derived",
    sourcePriority: ["meta_ads", "gohighlevel", "manual_import", "close"],
    targetable: true,
  },
  {
    key: "total_spend",
    label: "Total Amount Spent",
    section: "most_important_number",
    kind: "base",
    sourceFactType: "ad_spend",
    sourcePriority: ["meta_ads", "manual_import", "gohighlevel", "close"],
    targetable: true,
  },
  {
    key: "new_revenue_collected",
    label: "New Revenue Collected",
    section: "most_important_number",
    kind: "base",
    sourceFactType: "revenue_collected",
    sourcePriority: ["close", "manual_import", "gohighlevel", "meta_ads"],
    targetable: true,
  },
  {
    key: "new_revenue_booked",
    label: "New Revenue Booked",
    section: "most_important_number",
    kind: "base",
    sourceFactType: "revenue_booked",
    sourcePriority: ["close", "manual_import", "gohighlevel", "meta_ads"],
    targetable: true,
  },
  {
    key: "contribution_margin_collected",
    label: "Profit Collected",
    section: "most_important_number",
    kind: "derived",
    sourcePriority: ["close", "meta_ads", "manual_import", "gohighlevel"],
    targetable: true,
  },
  {
    key: "contribution_margin_booked",
    label: "Profit Booked",
    section: "most_important_number",
    kind: "derived",
    sourcePriority: ["close", "meta_ads", "manual_import", "gohighlevel"],
    targetable: true,
  },
  {
    key: "weekly_roas",
    label: "Weekly ROAS",
    section: "most_important_number",
    kind: "derived",
    sourcePriority: ["close", "meta_ads", "manual_import", "gohighlevel"],
    targetable: false,
  },
  {
    key: "monthly_roas",
    label: "Monthly ROAS",
    section: "most_important_number",
    kind: "derived",
    sourcePriority: ["close", "meta_ads", "manual_import", "gohighlevel"],
    targetable: false,
  },
  {
    key: "impressions",
    label: "Impressions",
    section: "ad_performance",
    kind: "base",
    sourceFactType: "impressions",
    sourcePriority: ["meta_ads", "manual_import", "gohighlevel", "close"],
    targetable: false,
  },
  {
    key: "link_clicks",
    label: "Link Clicks",
    section: "ad_performance",
    kind: "base",
    sourceFactType: "link_clicks",
    sourcePriority: ["meta_ads", "manual_import", "gohighlevel", "close"],
    targetable: false,
  },
  {
    key: "ctr",
    label: "CTR",
    section: "ad_performance",
    kind: "derived",
    sourcePriority: ["meta_ads", "manual_import", "gohighlevel", "close"],
    targetable: false,
  },
  {
    key: "cpm",
    label: "CPM",
    section: "ad_performance",
    kind: "derived",
    sourcePriority: ["meta_ads", "manual_import", "gohighlevel", "close"],
    targetable: false,
  },
  {
    key: "calls",
    label: "Calls",
    section: "book_a_demo_call",
    kind: "derived",
    sourcePriority: ["gohighlevel", "manual_import", "close", "meta_ads"],
    targetable: false,
  },
  {
    key: "cost_per_call",
    label: "Cost Per Call",
    section: "book_a_demo_call",
    kind: "derived",
    sourcePriority: ["meta_ads", "gohighlevel", "manual_import", "close"],
    targetable: false,
  },
];

export const METRIC_BY_KEY = new Map(
  METRIC_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export const PERFORMANCE_REPORT_DEFINITIONS: PerformanceReportDefinition[] = [
  {
    key: "meta_delivery",
    label: "Meta Delivery Report",
    description:
      "Ad-level traffic and delivery view for CTR, link clicks, impressions, CPM, and spend.",
    grain: "ad",
    metrics: ["impressions", "link_clicks", "ctr", "cpm", "total_spend"],
    primarySource: "meta_ads",
  },
  {
    key: "meta_funnel",
    label: "Meta Funnel Report",
    description:
      "Ad-level funnel view for leads, CPL, calls, cost per call, and new clients.",
    grain: "ad",
    metrics: [
      "leads",
      "cost_per_lead",
      "calls",
      "cost_per_call",
      "new_clients",
      "cost_per_new_client",
    ],
    primarySource: "meta_ads",
  },
  {
    key: "meta_revenue",
    label: "Meta Revenue Report",
    description:
      "Ad-level revenue and efficiency view for booked revenue, collected revenue, contribution margin, and ROAS.",
    grain: "ad",
    metrics: [
      "total_spend",
      "new_revenue_booked",
      "new_revenue_collected",
      "contribution_margin_booked",
      "contribution_margin_collected",
      "monthly_roas",
    ],
    primarySource: "meta_ads",
  },
];
