import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DriftReport } from "@schemabridge/shared-types";
import {
  applyReport,
  queryFleet,
  type DriftStore,
  type FleetDriftFilters,
  type FleetDriftRecord,
  type RecordReportResult
} from "./driftStore.js";

/**
 * Durable JSON-file persistence behind the DriftStore contract, so fleet drift
 * (and the "already seen" state that keeps alerting from re-firing) survives a
 * control-plane restart. Writes are atomic (temp file + rename) and serialized
 * so concurrent reports cannot interleave a partial snapshot.
 *
 * Shares all reconciliation/query logic with InMemoryDriftStore via the pure
 * applyReport/queryFleet helpers, so the two are behaviourally identical and a
 * Postgres-backed store is a drop-in replacement against the same contract.
 */
export class FileDriftStore implements DriftStore {
  private records: FleetDriftRecord[] | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  public constructor(private readonly filePath: string) {}

  public async recordReport(tenantId: string, report: DriftReport): Promise<RecordReportResult> {
    const current = await this.load();
    const { records, result } = applyReport(current, tenantId, report);
    this.records = records;
    await this.persist(records);
    return result;
  }

  public async listFleetDrift(tenantId: string, filters: FleetDriftFilters = {}): Promise<readonly FleetDriftRecord[]> {
    return queryFleet(await this.load(), tenantId, filters);
  }

  private async load(): Promise<FleetDriftRecord[]> {
    if (this.records) return this.records;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      this.records = Array.isArray(parsed) ? (parsed as FleetDriftRecord[]) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") this.records = [];
      else throw error;
    }
    return this.records;
  }

  private persist(records: readonly FleetDriftRecord[]): Promise<void> {
    // Serialize writes so a later snapshot never lands before an earlier one.
    const snapshot = JSON.stringify(records);
    this.writeChain = this.writeChain.then(() => this.atomicWrite(snapshot));
    return this.writeChain;
  }

  private async atomicWrite(contents: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmp, contents, "utf8");
    await rename(tmp, this.filePath);
  }
}
