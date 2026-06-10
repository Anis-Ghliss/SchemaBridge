import { request as undiciRequest, type Dispatcher } from "undici";
import type { FleetDriftRecord } from "./driftStore.js";

export interface DriftAlert {
  readonly tenantId: string;
  readonly instanceId: string;
  readonly bridgeVersion: string;
  readonly newFindings: readonly FleetDriftRecord[];
}

export interface Notifier {
  notify(alert: DriftAlert): Promise<void>;
}

export interface WebhookNotifierOptions {
  readonly token?: string;
  readonly timeoutMs?: number;
  readonly maxLines?: number;
  readonly dispatcher?: Dispatcher;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_LINES = 20;

/**
 * Posts a drift alert to a webhook. The payload carries a Slack-compatible
 * `text` summary plus the structured `alert` for generic consumers, so the same
 * endpoint works for Slack incoming webhooks and custom receivers alike.
 */
export class WebhookNotifier implements Notifier {
  public constructor(
    private readonly url: string,
    private readonly options: WebhookNotifierOptions = {}
  ) {}

  public async notify(alert: DriftAlert): Promise<void> {
    if (alert.newFindings.length === 0) return;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.token) headers["authorization"] = `Bearer ${this.options.token}`;
    const timeout = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const response = await undiciRequest(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(formatPayload(alert, this.options.maxLines ?? DEFAULT_MAX_LINES)),
      headersTimeout: timeout,
      bodyTimeout: timeout,
      dispatcher: this.options.dispatcher
    });
    await response.body.text();
    if (response.statusCode >= 400) {
      throw new Error(`alert webhook responded ${response.statusCode}`);
    }
  }
}

function formatPayload(alert: DriftAlert, maxLines: number): { text: string; alert: DriftAlert } {
  const count = alert.newFindings.length;
  const summary = `SchemaBridge: ${count} new contract drift ${count === 1 ? "signal" : "signals"} on instance ${alert.instanceId}`;
  const lines = alert.newFindings.slice(0, maxLines).map((finding) => {
    const type = finding.observedType ?? finding.expectedType ?? "";
    return `• [${finding.kind}] ${finding.stage} ${finding.path}${type ? ` (${type})` : ""}`;
  });
  if (count > maxLines) lines.push(`…and ${count - maxLines} more`);
  return { text: [summary, ...lines].join("\n"), alert };
}
