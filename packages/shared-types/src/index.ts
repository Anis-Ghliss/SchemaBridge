import { z } from "zod";

export const JsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonPrimitive = z.infer<typeof JsonPrimitiveSchema>;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([JsonPrimitiveSchema, z.array(JsonValueSchema), z.record(JsonValueSchema)])
);

export const SchemaFieldKindSchema = z.enum(["object", "array", "string", "number", "boolean", "null", "unknown"]);
export type SchemaFieldKind = z.infer<typeof SchemaFieldKindSchema>;

export const SchemaFieldSchema: z.ZodType<SchemaField, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    path: z.string(),
    label: z.string(),
    kind: SchemaFieldKindSchema,
    children: z.array(SchemaFieldSchema).default([]),
    item: SchemaFieldSchema.optional()
  })
);

export interface SchemaField {
  readonly path: string;
  readonly label: string;
  readonly kind: SchemaFieldKind;
  readonly children: readonly SchemaField[];
  readonly item?: SchemaField;
}

export const SchemaDocumentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  content: JsonValueSchema,
  fields: z.array(SchemaFieldSchema),
  createdAt: z.string().datetime()
});
export type SchemaDocument = z.infer<typeof SchemaDocumentSchema>;

export const MappingRuleTransformSchema = z.enum(["string", "number", "boolean", "lowercase", "uppercase", "iso-date"]);
export type MappingRuleTransform = z.infer<typeof MappingRuleTransformSchema>;

export const MappingRuleSchema = z.object({
  id: z.string().min(1),
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  defaultValue: JsonValueSchema.optional(),
  transform: MappingRuleTransformSchema.optional()
});
export type MappingRule = z.infer<typeof MappingRuleSchema>;

export const MappingVersionSchema = z.object({
  version: z.number().int().positive(),
  rules: z.array(MappingRuleSchema),
  createdAt: z.string().datetime()
});
export type MappingVersion = z.infer<typeof MappingVersionSchema>;

export const MappingDocumentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  sourceSchemaId: z.string().uuid(),
  targetSchemaId: z.string().uuid(),
  currentVersion: z.number().int().positive(),
  versions: z.array(MappingVersionSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type MappingDocument = z.infer<typeof MappingDocumentSchema>;

export const CreateSchemaRequestSchema = z.object({
  name: z.string().min(1),
  content: JsonValueSchema
});
export type CreateSchemaRequest = z.infer<typeof CreateSchemaRequestSchema>;

export const CreateMappingRequestSchema = z.object({
  name: z.string().min(1),
  sourceSchemaId: z.string().uuid(),
  targetSchemaId: z.string().uuid(),
  rules: z.array(MappingRuleSchema)
});
export type CreateMappingRequest = z.infer<typeof CreateMappingRequestSchema>;

export const TransformRequestSchema = z.object({
  input: JsonValueSchema,
  rules: z.array(MappingRuleSchema)
});
export type TransformRequest = z.infer<typeof TransformRequestSchema>;

export const TransformResultSchema = z.object({
  status: z.enum(["success", "error"]),
  output: JsonValueSchema.optional(),
  errors: z.array(z.string()).default([])
});
export type TransformResult = z.infer<typeof TransformResultSchema>;

export const RestoreMappingVersionRequestSchema = z.object({
  version: z.number().int().positive()
});
export type RestoreMappingVersionRequest = z.infer<typeof RestoreMappingVersionRequestSchema>;

export const ProxyBindingMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "*"]);
export type ProxyBindingMethod = z.infer<typeof ProxyBindingMethodSchema>;

export const ProxyBindingSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  method: ProxyBindingMethodSchema,
  pathPattern: z.string().min(1),
  upstreamBaseUrl: z.string().url(),
  mappingId: z.string().uuid(),
  responseMappingId: z.string().uuid().nullable(),
  forwardHeaders: z.array(z.string().min(1)),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ProxyBinding = z.infer<typeof ProxyBindingSchema>;

export const CreateProxyBindingRequestSchema = z.object({
  name: z.string().min(1),
  method: ProxyBindingMethodSchema,
  pathPattern: z.string().min(1),
  upstreamBaseUrl: z.string().url(),
  mappingId: z.string().uuid(),
  responseMappingId: z.string().uuid().nullable().optional(),
  forwardHeaders: z.array(z.string().min(1)).optional(),
  enabled: z.boolean().optional()
});
export type CreateProxyBindingRequest = z.infer<typeof CreateProxyBindingRequestSchema>;

export const UpdateProxyBindingRequestSchema = CreateProxyBindingRequestSchema.partial();
export type UpdateProxyBindingRequest = z.infer<typeof UpdateProxyBindingRequestSchema>;

export const ProxyRequestLogSchema = z.object({
  id: z.string().uuid(),
  bindingId: z.string().uuid().nullable(),
  appId: z.string().uuid().nullable(),
  method: z.string(),
  path: z.string(),
  statusCode: z.number().int(),
  durationMs: z.number().int().nonnegative(),
  upstreamUrl: z.string().nullable(),
  transformedRequest: JsonValueSchema.nullable(),
  responseBody: JsonValueSchema.nullable(),
  errors: z.array(z.string()),
  createdAt: z.string().datetime()
});
export type ProxyRequestLog = z.infer<typeof ProxyRequestLogSchema>;

export const ProxyAppScopeSchema = z.enum(["all", "selected"]);
export type ProxyAppScope = z.infer<typeof ProxyAppScopeSchema>;

export const ProxyAppSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  keyPrefix: z.string(),
  scope: ProxyAppScopeSchema,
  bindingIds: z.array(z.string().uuid()),
  enabled: z.boolean(),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ProxyApp = z.infer<typeof ProxyAppSchema>;

export const ProxyAppWithKeySchema = ProxyAppSchema.extend({ key: z.string() });
export type ProxyAppWithKey = z.infer<typeof ProxyAppWithKeySchema>;

export const CreateProxyAppRequestSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  scope: ProxyAppScopeSchema.optional(),
  bindingIds: z.array(z.string().uuid()).optional(),
  enabled: z.boolean().optional()
});
export type CreateProxyAppRequest = z.infer<typeof CreateProxyAppRequestSchema>;

export const UpdateProxyAppRequestSchema = CreateProxyAppRequestSchema.partial();
export type UpdateProxyAppRequest = z.infer<typeof UpdateProxyAppRequestSchema>;
