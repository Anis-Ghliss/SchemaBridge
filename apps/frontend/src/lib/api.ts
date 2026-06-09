import type {
  CreateMappingRequest,
  CreateProxyAppRequest,
  CreateProxyBindingRequest,
  CreateSchemaRequest,
  DriftEvent,
  MappingDocument,
  ProxyApp,
  ProxyAppWithKey,
  ProxyBinding,
  ProxyRequestLog,
  SchemaDocument,
  TransformRequest,
  TransformResult,
  UpdateMappingVersionRequest,
  UpdateProxyAppRequest,
  UpdateProxyBindingRequest,
  UpdateSchemaRequest
} from "@schemabridge/shared-types";

export const API_URL = resolveApiUrl();
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

export async function updateSchema(id: string, input: UpdateSchemaRequest): Promise<SchemaDocument> {
  return request(`/schemas/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteSchema(id: string, options: { readonly cascade?: boolean } = {}): Promise<void> {
  await request<void>(`/schemas/${id}${options.cascade ? "?cascade=true" : ""}`, { method: "DELETE" });
}

export async function deleteMapping(id: string, options: { readonly cascade?: boolean } = {}): Promise<void> {
  await request<void>(`/mappings/${id}${options.cascade ? "?cascade=true" : ""}`, { method: "DELETE" });
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

export async function updateCurrentMappingVersion(id: string, rules: UpdateMappingVersionRequest["rules"]): Promise<MappingDocument> {
  return request(`/mappings/${id}/versions/current`, { method: "PATCH", body: JSON.stringify({ rules }) });
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
  await request<void>(`/bindings/${id}`, { method: "DELETE" });
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
  await request<void>(`/apps/${id}`, { method: "DELETE" });
}

export async function listProxyRequests(options: { readonly limit?: number; readonly since?: string } = {}): Promise<readonly ProxyRequestLog[]> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.since) params.set("since", options.since);
  const suffix = params.toString();
  return request(`/proxy/requests${suffix ? `?${suffix}` : ""}`);
}

export async function listDriftEvents(options: { readonly bindingId?: string; readonly limit?: number } = {}): Promise<readonly DriftEvent[]> {
  const params = new URLSearchParams();
  if (options.bindingId) params.set("bindingId", options.bindingId);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const suffix = params.toString();
  return request(`/drift${suffix ? `?${suffix}` : ""}`);
}

export async function acknowledgeDriftEvent(id: string): Promise<void> {
  await request<void>(`/drift/${id}`, { method: "DELETE" });
}

export async function clearDriftEvents(options: { readonly bindingId?: string } = {}): Promise<void> {
  await request<void>(`/drift${options.bindingId ? `?bindingId=${options.bindingId}` : ""}`, { method: "DELETE" });
}

export interface ProxyProbeResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export async function probeBinding(bindingId: string, input: unknown, options: { readonly appId?: string } = {}): Promise<ProxyProbeResult> {
  return request(`/bindings/${bindingId}/probe`, {
    method: "POST",
    body: JSON.stringify({ input, appId: options.appId ?? null })
  });
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
  return pattern.replace(/:([A-Za-z0-9_]+)/g, "sample");
}

const ADMIN_TOKEN_STORAGE = "schemabridge:admin-token";

// Stored in sessionStorage (not localStorage): the admin token lives only for
// the tab session and is not persisted to disk, limiting exposure if the GUI
// is ever hit by XSS or used on a shared machine.
export function getAdminToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE) ?? undefined;
}

export function setAdminToken(token: string | undefined): void {
  if (typeof window === "undefined") return;
  if (token && token.length > 0) window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE, token);
  else window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE);
}

let onUnauthorized: (() => void) | undefined;
export function onAdminUnauthorized(handler: () => void): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined ?? {}) };
  if (init?.body !== undefined && !hasHeader(headers, "content-type")) {
    headers["content-type"] = "application/json";
  }
  const token = getAdminToken();
  if (token) headers["authorization"] = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && onUnauthorized) onUnauthorized();
  if (response.status === 204) return undefined as unknown as T;
  const data = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(formatApiError(data));
  }
  return data;
}

function formatApiError(data: unknown): string {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  if (data && typeof data === "object" && "errors" in data) return JSON.stringify(data.errors);
  return JSON.stringify(data);
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lowered = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lowered);
}
