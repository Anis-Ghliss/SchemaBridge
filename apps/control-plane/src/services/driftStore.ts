import type { DriftKind, DriftReport, DriftStage } from "@schemabridge/shared-types";

export interface FleetDriftRecord {
  readonly tenantId: string;
  readonly instanceId: string;
  readonly bridgeVersion: string;
  readonly bindingId: string;
  readonly stage: DriftStage;
  readonly kind: DriftKind;
  readonly path: string;
  readonly expectedType: string | null;
  readonly observedType: string | null;
  readonly count: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly reportedAt: string;
}

export interface FleetDriftFilters {
  readonly instanceId?: string;
  readonly bindingId?: string;
  readonly kind?: DriftKind;
  readonly limit?: number;
}

export interface RecordReportResult {
  /** Number of drift findings in the snapshot. */
  readonly accepted: number;
  /** Findings present in this report that were not in the instance's prior snapshot — the alertable ones. */
  readonly newFindings: readonly FleetDriftRecord[];
}

export interface DriftStore {
  recordReport(tenantId: string, report: DriftReport): Promise<RecordReportResult>;
  listFleetDrift(tenantId: string, filters?: FleetDriftFilters): Promise<readonly FleetDriftRecord[]>;
}

function recordKey(record: Pick<FleetDriftRecord, "bindingId" | "stage" | "kind" | "path">): string {
  return `${record.bindingId}|${record.stage}|${record.kind}|${record.path}`;
}

/**
 * Each report is a full snapshot of one instance's current drift, so ingest
 * *replaces* everything previously stored for that (tenant, instance). Drift a
 * data plane has acknowledged or cleared therefore disappears from the fleet
 * view on its next report — the store converges to the data plane's truth.
 */
export class InMemoryDriftStore implements DriftStore {
  private records: FleetDriftRecord[] = [];

  public async recordReport(tenantId: string, report: DriftReport): Promise<RecordReportResult> {
    const priorKeys = new Set(
      this.records
        .filter((record) => record.tenantId === tenantId && record.instanceId === report.instanceId)
        .map(recordKey)
    );
    this.records = this.records.filter((record) => !(record.tenantId === tenantId && record.instanceId === report.instanceId));

    const newFindings: FleetDriftRecord[] = [];
    for (const event of report.events) {
      const record: FleetDriftRecord = {
        tenantId,
        instanceId: report.instanceId,
        bridgeVersion: report.bridgeVersion,
        bindingId: event.bindingId,
        stage: event.stage,
        kind: event.kind,
        path: event.path,
        expectedType: event.expectedType,
        observedType: event.observedType,
        count: event.count,
        firstSeenAt: event.firstSeenAt,
        lastSeenAt: event.lastSeenAt,
        reportedAt: report.reportedAt
      };
      this.records.push(record);
      if (!priorKeys.has(recordKey(record))) newFindings.push(record);
    }
    return { accepted: report.events.length, newFindings };
  }

  public async listFleetDrift(tenantId: string, filters: FleetDriftFilters = {}): Promise<readonly FleetDriftRecord[]> {
    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
    return this.records
      .filter((record) => record.tenantId === tenantId)
      .filter((record) => (filters.instanceId ? record.instanceId === filters.instanceId : true))
      .filter((record) => (filters.bindingId ? record.bindingId === filters.bindingId : true))
      .filter((record) => (filters.kind ? record.kind === filters.kind : true))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, limit);
  }
}
