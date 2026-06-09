import type { JsonValue, MappingRule, ProxyBindingMethod } from "@schemabridge/shared-types";
import { transformPayload, validateAgainstExample } from "@schemabridge/transformation-engine";
import { match, type MatchFunction } from "path-to-regexp";
import { request as undiciRequest, type Dispatcher } from "undici";
import type { ActiveBinding, SchemaBridgeRepository } from "./repository.js";

export interface ProxyRequest {
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: unknown;
}

export interface ProxyTrace {
  readonly upstreamUrl?: string;
  readonly transformedRequest?: unknown;
  readonly errors: readonly string[];
}

export interface ProxyResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: unknown;
  readonly trace: ProxyTrace;
}

interface CompiledBinding {
  readonly active: ActiveBinding;
  readonly matcher: MatchFunction<Record<string, string>>;
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length"
]);

export class ProxyService {
  private compiled: readonly CompiledBinding[] = [];

  public constructor(
    private readonly repository: SchemaBridgeRepository,
    private readonly options: { readonly dispatcher?: Dispatcher; readonly upstreamTimeoutMs?: number } = {}
  ) {}

  public async reload(): Promise<void> {
    const active = await this.repository.listActiveBindings();
    this.compiled = active.map((entry) => ({
      active: entry,
      matcher: match<Record<string, string>>(entry.binding.pathPattern, { decode: decodeURIComponent })
    }));
  }

  public matchBinding(method: string, path: string): { readonly active: ActiveBinding; readonly params: Record<string, string> } | null {
    const upper = method.toUpperCase() as ProxyBindingMethod;
    for (const candidate of this.compiled) {
      const bindingMethod = candidate.active.binding.method;
      if (bindingMethod !== "*" && bindingMethod !== upper) continue;
      const result = candidate.matcher(path);
      if (!result) continue;
      return { active: candidate.active, params: result.params };
    }
    return null;
  }

  public async forward(active: ActiveBinding, req: ProxyRequest): Promise<ProxyResponse> {
    const { binding, requestRules, responseRules } = active;
    const validationErrors: string[] = [];

    const requestSourceValidation = validatePayload("request-source", req.body, active.requestSourceSchema, binding.validationMode, validationErrors);
    if (!requestSourceValidation.ok) {
      return validationFailure(400, "request-validation", requestSourceValidation.errors);
    }

    const transformedBody = transformBody(req.body, requestRules, "request");
    if (!transformedBody.ok) {
      const errors = [...validationErrors, ...transformedBody.errors.map((message) => `request-mapping: ${message}`)];
      return {
        statusCode: 502,
        headers: { "content-type": "application/json" },
        body: { stage: "request-mapping", errors: transformedBody.errors },
        trace: { errors }
      };
    }

    const requestTargetValidation = validatePayload("request-target", transformedBody.value, active.requestTargetSchema, binding.validationMode, validationErrors);
    if (!requestTargetValidation.ok) {
      return validationFailure(502, "request-validation", requestTargetValidation.errors, transformedBody.value);
    }

    const forwardedHeaders = pickHeaders(req.headers, binding.forwardHeaders);
    const upstreamUrl = joinUrl(binding.upstreamBaseUrl, req.path, req.query);

    let upstream: Dispatcher.ResponseData;
    try {
      upstream = await undiciRequest(upstreamUrl, {
        method: req.method as Dispatcher.HttpMethod,
        headers: forwardedHeaders,
        body: serializeBody(transformedBody.value),
        headersTimeout: this.options.upstreamTimeoutMs,
        bodyTimeout: this.options.upstreamTimeoutMs,
        dispatcher: this.options.dispatcher
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown upstream error";
      return {
        statusCode: 502,
        headers: { "content-type": "application/json" },
        body: { stage: "upstream", error: message },
        trace: { upstreamUrl, transformedRequest: transformedBody.value, errors: [...validationErrors, `upstream: ${message}`] }
      };
    }

    const responseHeaders = stripHopByHop(upstream.headers);
    const upstreamBody = await readBody(upstream);

    if (responseRules.length > 0 && !isJsonContentType(responseHeaders["content-type"])) {
      const errors = [`response-source must be JSON to apply response mapping`];
      if (binding.validationMode === "strict") {
        return validationFailure(502, "response-validation", errors, transformedBody.value, upstreamUrl);
      }
      if (binding.validationMode === "warn") validationErrors.push(...errors.map((message) => `validation: ${message}`));
    }

    if (responseRules.length > 0 && isJsonContentType(responseHeaders["content-type"])) {
      const parsed = safeJsonParse(upstreamBody);
      if (parsed.ok) {
        if (active.responseSourceSchema !== undefined) {
          const responseSourceValidation = validatePayload("response-source", parsed.value, active.responseSourceSchema, binding.validationMode, validationErrors);
          if (!responseSourceValidation.ok) {
            return validationFailure(502, "response-validation", responseSourceValidation.errors, transformedBody.value, upstreamUrl);
          }
        }
        const transformedResponse = transformBody(parsed.value, responseRules, "response");
        if (!transformedResponse.ok) {
          const errors = [...validationErrors, ...transformedResponse.errors.map((message) => `response-mapping: ${message}`)];
          return {
            statusCode: 502,
            headers: { "content-type": "application/json" },
            body: { stage: "response-mapping", errors: transformedResponse.errors },
            trace: { upstreamUrl, transformedRequest: transformedBody.value, errors }
          };
        }
        if (active.responseTargetSchema !== undefined) {
          const responseTargetValidation = validatePayload("response-target", transformedResponse.value, active.responseTargetSchema, binding.validationMode, validationErrors);
          if (!responseTargetValidation.ok) {
            return validationFailure(502, "response-validation", responseTargetValidation.errors, transformedBody.value, upstreamUrl);
          }
        }
        return {
          statusCode: upstream.statusCode,
          headers: { ...responseHeaders, "content-type": "application/json" },
          body: transformedResponse.value,
          trace: { upstreamUrl, transformedRequest: transformedBody.value, errors: validationErrors }
        };
      }
    }

    return {
      statusCode: upstream.statusCode,
      headers: responseHeaders,
      body: upstreamBody,
      trace: { upstreamUrl, transformedRequest: transformedBody.value, errors: validationErrors }
    };
  }
}

function validatePayload(
  stage: string,
  value: unknown,
  example: JsonValue,
  mode: "off" | "warn" | "strict",
  warnings: string[]
): { readonly ok: true } | { readonly ok: false; readonly errors: readonly string[] } {
  if (mode === "off") return { ok: true };
  const errors = validateAgainstExample(value, example, stage).map((message) => `validation: ${message}`);
  if (errors.length === 0) return { ok: true };
  if (mode === "warn") {
    warnings.push(...errors);
    return { ok: true };
  }
  return { ok: false, errors };
}

function validationFailure(statusCode: number, stage: string, errors: readonly string[], transformedRequest?: unknown, upstreamUrl?: string): ProxyResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: { stage, errors },
    trace: { upstreamUrl, transformedRequest, errors }
  };
}

function transformBody(body: unknown, rules: readonly MappingRule[], stage: "request" | "response"): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly errors: readonly string[] } {
  if (rules.length === 0) return { ok: true, value: body };
  if (body === undefined || body === null) return { ok: true, value: body };
  if (typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: [`${stage} payload must be a JSON object to apply mapping rules`] };
  }
  const result = transformPayload(body as JsonValue, rules, { includeMissingErrors: false });
  if (result.status === "error") return { ok: false, errors: result.errors };
  return { ok: true, value: result.output };
}

function pickHeaders(headers: ProxyRequest["headers"], allowlist: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const lower = new Set(allowlist.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(headers)) {
    const lowered = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowered)) continue;
    if (!lower.has(lowered)) continue;
    if (value === undefined) continue;
    out[lowered] = Array.isArray(value) ? value.join(",") : value;
  }
  return out;
}

function stripHopByHop(headers: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

function joinUrl(base: string, path: string, query: string): string {
  const baseTrimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  const pathWithLead = path.startsWith("/") ? path : `/${path}`;
  const querySuffix = query && query.length > 0 ? (query.startsWith("?") ? query : `?${query}`) : "";
  return `${baseTrimmed}${pathWithLead}${querySuffix}`;
}

function serializeBody(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

async function readBody(response: Dispatcher.ResponseData): Promise<unknown> {
  const text = await response.body.text();
  if (text.length === 0) return null;
  if (isJsonContentType(response.headers["content-type"])) {
    const parsed = safeJsonParse(text);
    return parsed.ok ? parsed.value : text;
  }
  return text;
}

function safeJsonParse(value: unknown): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  if (typeof value !== "string") return { ok: true, value };
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function isJsonContentType(value: string | string[] | undefined): boolean {
  if (!value) return false;
  const header = Array.isArray(value) ? value.join(",") : value;
  return header.toLowerCase().includes("application/json");
}
