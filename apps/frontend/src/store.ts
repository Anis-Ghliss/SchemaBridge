import type { CreateProxyBindingRequest, JsonValue, MappingDocument, MappingRule, ProxyBinding, SchemaDocument, UpdateProxyBindingRequest } from "@schemabridge/shared-types";
import { create } from "zustand";
import {
  createBinding,
  createMapping,
  createMappingVersion,
  createSchema,
  deleteBinding,
  listBindings,
  listMappings,
  listSchemas,
  restoreMappingVersion,
  transform,
  updateBinding
} from "./lib/api";
import { sampleSource, sampleTarget } from "./lib/samples";

export type AppView = "define" | "connect" | "deploy" | "observe";

export const APP_STEPS: readonly { readonly id: AppView; readonly label: string; readonly hint: string }[] = [
  { id: "define", label: "Define", hint: "Capture both shapes" },
  { id: "connect", label: "Connect", hint: "Map source fields to target" },
  { id: "deploy", label: "Deploy", hint: "Wire up a runtime route" },
  { id: "observe", label: "Observe", hint: "Send and watch traffic" }
];

interface AppState {
  readonly view: AppView;
  readonly schemas: readonly SchemaDocument[];
  readonly mappings: readonly MappingDocument[];
  readonly bindings: readonly ProxyBinding[];
  readonly sourceSchema?: SchemaDocument;
  readonly targetSchema?: SchemaDocument;
  readonly activeMapping?: MappingDocument;
  readonly rules: readonly MappingRule[];
  readonly status: string;
  readonly output?: JsonValue;
  readonly error?: string;
  readonly setView: (view: AppView) => void;
  readonly load: () => Promise<void>;
  readonly saveSchemaPair: (source: { readonly name: string; readonly content: JsonValue }, target: { readonly name: string; readonly content: JsonValue }) => Promise<void>;
  readonly setRules: (rules: readonly MappingRule[]) => void;
  readonly saveMapping: (name: string) => Promise<void>;
  readonly saveVersion: () => Promise<void>;
  readonly restoreVersion: (version: number) => Promise<void>;
  readonly runTransform: (input: JsonValue) => Promise<void>;
  readonly addBinding: (input: CreateProxyBindingRequest) => Promise<void>;
  readonly editBinding: (id: string, input: UpdateProxyBindingRequest) => Promise<void>;
  readonly removeBinding: (id: string) => Promise<void>;
  readonly loadSample: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "define",
  schemas: [],
  mappings: [],
  bindings: [],
  rules: [],
  status: "Ready",
  setView(view) {
    set({ view });
  },
  async load() {
    const [schemas, mappings, bindings] = await Promise.all([listSchemas(), listMappings(), listBindings()]);
    const preferredMappingId = bindings[0]?.mappingId;
    const activeMapping = (preferredMappingId ? mappings.find((mapping) => mapping.id === preferredMappingId) : undefined) ?? mappings[0];
    const sourceSchema = activeMapping ? schemas.find((schema) => schema.id === activeMapping.sourceSchemaId) : undefined;
    const targetSchema = activeMapping ? schemas.find((schema) => schema.id === activeMapping.targetSchemaId) : undefined;
    set({
      schemas,
      mappings,
      bindings,
      activeMapping,
      sourceSchema,
      targetSchema,
      rules: activeMapping?.versions.find((version) => version.version === activeMapping.currentVersion)?.rules ?? []
    });
  },
  async saveSchemaPair(source, target) {
    set({ status: "Saving schemas", error: undefined });
    const [sourceSchema, targetSchema] = await Promise.all([createSchema(source), createSchema(target)]);
    set({ sourceSchema, targetSchema, schemas: [sourceSchema, targetSchema, ...get().schemas], status: "Schemas saved" });
  },
  setRules(rules) {
    set({ rules });
  },
  async saveMapping(name) {
    const { sourceSchema, targetSchema, rules } = get();
    if (!sourceSchema || !targetSchema) throw new Error("Save source and target schemas before creating a mapping.");
    const mapping = await createMapping({ name, sourceSchemaId: sourceSchema.id, targetSchemaId: targetSchema.id, rules: [...rules] });
    set({ activeMapping: mapping, mappings: [mapping, ...get().mappings], status: "Mapping saved" });
  },
  async saveVersion() {
    const { activeMapping, rules } = get();
    if (!activeMapping) throw new Error("Save a mapping before creating versions.");
    const mapping = await createMappingVersion(activeMapping.id, [...rules]);
    set({ activeMapping: mapping, mappings: get().mappings.map((item) => (item.id === mapping.id ? mapping : item)), status: `Version ${mapping.currentVersion} saved` });
  },
  async restoreVersion(version) {
    const { activeMapping } = get();
    if (!activeMapping) throw new Error("No active mapping selected.");
    const mapping = await restoreMappingVersion(activeMapping.id, version);
    const rules = mapping.versions.find((item) => item.version === version)?.rules ?? [];
    set({ activeMapping: mapping, rules, status: `Restored version ${version}` });
  },
  async runTransform(input) {
    const result = await transform({ input, rules: [...get().rules] });
    set({ output: result.output, status: result.status === "success" ? "Transformation succeeded" : result.errors.join(", "), error: result.status === "error" ? result.errors.join(", ") : undefined });
  },
  async addBinding(input) {
    const binding = await createBinding(input);
    set({ bindings: [...get().bindings, binding], status: `Binding ${binding.name} created` });
  },
  async editBinding(id, input) {
    const binding = await updateBinding(id, input);
    set({ bindings: get().bindings.map((item) => (item.id === id ? binding : item)), status: `Binding ${binding.name} updated` });
  },
  async removeBinding(id) {
    await deleteBinding(id);
    set({ bindings: get().bindings.filter((item) => item.id !== id), status: "Binding removed" });
  },
  async loadSample() {
    set({ status: "Loading sample…", error: undefined });
    const [sourceSchema, targetSchema] = await Promise.all([
      createSchema({ name: "Customer API v1", content: sampleSource }),
      createSchema({ name: "Customer API v2", content: sampleTarget })
    ]);
    const rules: MappingRule[] = [
      { id: crypto.randomUUID(), sourcePath: "customerName", targetPath: "customer.name" },
      { id: crypto.randomUUID(), sourcePath: "customerEmail", targetPath: "customer.email" },
      { id: crypto.randomUUID(), sourcePath: "shippingCity", targetPath: "customer.address.city" },
      { id: crypto.randomUUID(), sourcePath: "plan", targetPath: "subscription.tier" }
    ];
    const mapping = await createMapping({ name: "Customer v1 → v2", sourceSchemaId: sourceSchema.id, targetSchemaId: targetSchema.id, rules });
    set({
      sourceSchema,
      targetSchema,
      activeMapping: mapping,
      schemas: [sourceSchema, targetSchema, ...get().schemas],
      mappings: [mapping, ...get().mappings],
      rules,
      status: "Sample loaded — pick a target service and create a binding"
    });
  }
}));
