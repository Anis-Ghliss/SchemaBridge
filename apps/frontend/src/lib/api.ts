import type {
  CreateMappingRequest,
  CreateProxyBindingRequest,
  CreateSchemaRequest,
  MappingDocument,
  ProxyBinding,
  SchemaDocument,
  TransformRequest,
  TransformResult,
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

export interface ProxyProbeResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export async function probeProxy(binding: ProxyBinding, body: unknown): Promise<ProxyProbeResult> {
  const method = binding.method === "*" ? "POST" : binding.method;
  const url = `${PROXY_URL}${concretizePath(binding.pathPattern)}`;
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: methodHasBody(method) ? JSON.stringify(body) : undefined
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text.length === 0 ? null : JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, headers, body: parsed };
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
