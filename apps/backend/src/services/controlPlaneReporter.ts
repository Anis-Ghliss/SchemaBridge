import { request as undiciRequest, type Dispatcher } from "undici";
import type { DriftReport } from "@schemabridge/shared-types";
import type { SchemaBridgeRepository } from "./repository.js";
import { DEFAULT_RETRY_POLICY, nextDelayMs, type RetryPolicy } from "./flushRetryPolicy.js";

export interface ControlPlaneReporterOptions {
  /** Base URL of the control plane (e.g. https://app.schemabridge.io). */
  readonly url: string;
  /** Bearer token identifying this instance to the control plane. */
  readonly token?: string;
  /** Stable identity for this data-plane instance. */
  readonly instanceId: string;
  readonly bridgeVersion: string;
  readonly intervalMs?: number;
  readonly maxEvents?: number;
  readonly timeoutMs?: number;
  readonly dispatcher?: Dispatcher;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => Date;
  readonly retryPolicy?: RetryPolicy;
  /** Injectable delay for deterministic tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export type FlushResult = { readonly status: "sent"; readonly count: number } | { readonly status: "skipped" };

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_MAX_EVENTS = 500;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Data-plane half of the hybrid topology. The proxy stays in the customer's
 * infra; this reporter periodically pushes a snapshot of the instance's current
 * drift state to the control plane. It never throws into the app — a failed
 * report is logged and retried on the next tick — so the control plane being
 * down can never affect proxied traffic.
 */
export class ControlPlaneReporter {
  private timer?: NodeJS.Timeout;
  private readonly now: () => Date;

  public constructor(
    private readonly repository: SchemaBridgeRepository,
    private readonly options: ControlPlaneReporterOptions
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async flushOnce(): Promise<FlushResult> {
    const events = await this.repository.listDriftEvents({ limit: this.options.maxEvents ?? DEFAULT_MAX_EVENTS });
    if (events.length === 0) return { status: "skipped" };

    const report: DriftReport = {
      instanceId: this.options.instanceId,
      bridgeVersion: this.options.bridgeVersion,
      reportedAt: this.now().toISOString(),
      events: [...events]
    };

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.token) headers["authorization"] = `Bearer ${this.options.token}`;
    const timeout = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const response = await undiciRequest(joinUrl(this.options.url, "/ingest/drift"), {
      method: "POST",
      headers,
      body: JSON.stringify(report),
      headersTimeout: timeout,
      bodyTimeout: timeout,
      dispatcher: this.options.dispatcher
    });
    await response.body.text();
    if (response.statusCode >= 400) {
      throw new Error(`control plane responded ${response.statusCode}`);
    }
    return { status: "sent", count: events.length };
  }

  public start(): void {
    if (this.timer) return;
    const interval = this.options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.flushSafely(), interval);
    this.timer.unref();
    void this.flushSafely();
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async flushSafely(): Promise<void> {
    const policy = this.options.retryPolicy ?? DEFAULT_RETRY_POLICY;
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      try {
        await this.flushOnce();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        if (attempt === policy.maxAttempts) {
          console.warn(`[control-plane] drift report failed after ${attempt} attempts: ${message}`);
          return;
        }
        await sleep(nextDelayMs(policy, attempt));
      }
    }
  }
}

function joinUrl(base: string, path: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}${path}`;
}
