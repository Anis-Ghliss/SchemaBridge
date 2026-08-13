import type { DriftReport } from "@schemabridge/shared-types";

/**
 * Transport abstraction for shipping drift reports off the data plane.
 * The default transport POSTs to the control plane over HTTPS; this seam
 * lets deployments swap in a broker-backed transport without touching the
 * reporter's batching/scheduling logic.
 */
export interface DriftReportTransport {
  send(report: DriftReport): Promise<void>;
}

/** Minimal surface of an AMQP confirm-channel we depend on (injected, not imported). */
export interface AmqpChannelLike {
  publish(exchange: string, routingKey: string, content: Buffer, options?: { persistent?: boolean; contentType?: string }): boolean;
  waitForConfirms(): Promise<void>;
}

export interface RabbitMqDriftTransportOptions {
  /** Exchange the drift reports are published to. */
  readonly exchange: string;
  /** Routing key; defaults to "drift.report". */
  readonly routingKey?: string;
}

const DEFAULT_ROUTING_KEY = "drift.report";

/**
 * Publishes drift reports to a RabbitMQ exchange instead of POSTing them to
 * the control plane directly. Decouples the data plane from control-plane
 * availability: the broker absorbs reports while the control plane is down,
 * so nothing is dropped between retries and back-pressure is handled by the
 * queue rather than by widening the reporter's in-memory batch.
 *
 * The channel is injected (same pattern as the reporter's `dispatcher`/`now`
 * options) so tests and callers control connection lifecycle and confirms.
 */
export class RabbitMqDriftTransport implements DriftReportTransport {
  public constructor(
    private readonly channel: AmqpChannelLike,
    private readonly options: RabbitMqDriftTransportOptions
  ) {}

  public async send(report: DriftReport): Promise<void> {
    const routingKey = this.options.routingKey ?? DEFAULT_ROUTING_KEY;
    const payload = Buffer.from(JSON.stringify(report));
    this.channel.publish(this.options.exchange, routingKey, payload, {
      persistent: true,
      contentType: "application/json"
    });
    await this.channel.waitForConfirms();
  }
}
