import type {
  CreateMappingRequest,
  CreateProxyAppRequest,
  CreateProxyBindingRequest,
  CreateSchemaRequest,
  MappingDocument,
  ProxyApp,
  ProxyAppWithKey,
  ProxyBinding,
  ProxyRequestLog,
  SchemaDocument,
  TransformRequest,
  TransformResult,
  UpdateProxyAppRequest,
  UpdateProxyBindingRequest
} from "@schemabridge/shared-types";

const API_URL = resolveApiUrl();
export const PROXY_URL = resolveProxyUrl();

function resolveApiUrl(): string {
  const override = import.meta.env.VITE_API_URL;
  if (override) return override;
  if (typeof window === "undefined") return "http://localhost:4000";
  return window.location.origin;
}

function resolveProxyUrl(): string {
  const override = import.meta.env.VITE_PROXY_URL;
  if (override) return override;
  if (typeof window === "undefined") return "http://localhost:8080";
  return `${window.location.protocol}//${window.location.hostname}:8080`;
}

export async function createSchema(input: CreateSchemaRequest): Promise<SchemaDocument> {
  return request("/schemas", { method: "POST", body: JSON.stringify(input) });
}

export async function listSchemas(): Promise<readonly SchemaDocument[]> {
  return request("/schemas");
}

export async function createMapping(input: CreateMappingRequest): Promise<MappingDocument> {
  return request("/mappings", { method: "POST", body: JSON.stringify(input) });
}

export async function listMappings(): Promise<readonly MappingDocument[]> {
  return request("/mappings");
}

export async function createMappingVersion(id: string, rules: CreateMappingRequest["rules"]): Promise<MappingDocument> {
  return request(`/mappings/${id}/versions`, { method: "POST", body: JSON.stringify({ rules }) });
}

export async function restoreMappingVersion(id: string, version: number): Promise<MappingDocument> {
  return request(`/mappings/${id}/restore`, { method: "POST", body: JSON.stringify({ version }) });
}

export async function transform(input: TransformRequest): Promise<TransformResult> {
  return request("/transform", { method: "POST", body: JSON.stringify(input) });
}

export async function listBindings(): Promise<readonly ProxyBinding[]> {
  return request("/bindings");
}

export async function createBinding(input: CreateProxyBindingRequest): Promise<ProxyBinding> {
  return request("/bindings", { method: "POST", body: JSON.stringify(input) });
}

export async function updateBinding(id: string, input: UpdateProxyBindingRequest): Promise<ProxyBinding> {
  return request(`/bindings/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteBinding(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/bindings/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
}

export async function listProxyApps(): Promise<readonly ProxyApp[]> {
  return request("/apps");
}

export async function createProxyApp(input: CreateProxyAppRequest): Promise<ProxyAppWithKey> {
  return request("/apps", { method: "POST", body: JSON.stringify(input) });
}

export async function updateProxyApp(id: string, input: UpdateProxyAppRequest): Promise<ProxyApp> {
  return request(`/apps/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function rotateProxyAppKey(id: string): Promise<ProxyAppWithKey> {
  return request(`/apps/${id}/rotate`, { method: "POST" });
}

export async function deleteProxyApp(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/apps/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
}

export async function listProxyRequests(options: { readonly limit?: number; readonly since?: string } = {}): Promise<readonly ProxyRequestLog[]> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.since) params.set("since", options.since);
  const suffix = params.toString();
  return request(`/proxy/requests${suffix ? `?${suffix}` : ""}`);
}

export interface ProxyProbeResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export async function probeProxy(binding: ProxyBinding, body: unknown, options: { readonly apiKey?: string } = {}): Promise<ProxyProbeResult> {
  const method = binding.method === "*" ? "POST" : binding.method;
  const url = `${PROXY_URL}${concretizePath(binding.pathPattern)}`;
  const requestHeaders: Record<string, string> = { "content-type": "application/json" };
  if (options.apiKey) requestHeaders["authorization"] = `Bearer ${options.apiKey}`;
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: methodHasBody(method) ? JSON.stringify(body) : undefined
  });
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text.length === 0 ? null : JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, headers: responseHeaders, body: parsed };
}

function methodHasBody(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH";
}

function concretizePath(pattern: string): string {
  return pattern.replace(/:([A-Za-z0-9_]+)/g, "demo");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const data = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }
  return data;
}
