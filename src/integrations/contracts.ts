import {
  Client,
  DataSource,
  NormalizedFact,
  RawSnapshot,
  ReviewException,
  SourcePlatform,
} from "../domain/model.js";

export interface SyncWindow {
  startDate: string;
  endDate: string;
  reason: "scheduled_rollforward" | "manual_resync" | "backfill" | "deletion_reconciliation";
}

export interface ConnectorContext {
  client: Client;
  dataSource: DataSource;
  syncWindow: SyncWindow;
}

export interface ConnectorSyncResult {
  source: SourcePlatform;
  rawSnapshots: RawSnapshot[];
  facts: NormalizedFact[];
  exceptions: ReviewException[];
  deletedSourceRecordKeys: string[];
}

export interface ConnectorAdapter {
  source: SourcePlatform;
  pull(context: ConnectorContext): Promise<ConnectorSyncResult>;
}

export interface TestSyncPreview {
  source: SourcePlatform;
  sampleWindow: SyncWindow;
  notes: string[];
}

export interface ConnectorRegistry {
  getAdapter(source: SourcePlatform): ConnectorAdapter;
}
