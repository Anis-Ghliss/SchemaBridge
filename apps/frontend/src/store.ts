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

export type ResourceView = "schemas" | "mappings" | "bindings" | "live";

interface AppState {
  readonly view: ResourceView;
  readonly selectedSchemaId?: string;
  readonly selectedMappingId?: string;
  readonly selectedBindingId?: string;
  readonly quickStartOpen: boolean;
  readonly schemas: readonly SchemaDocument[];
  readonly mappings: readonly MappingDocument[];
  readonly bindings: readonly ProxyBinding[];
  readonly activeMapping?: MappingDocument;
  readonly rules: readonly MappingRule[];
  readonly status: string;
  readonly output?: JsonValue;
  readonly error?: string;
  readonly setView: (view: ResourceView) => void;
  readonly selectSchema: (id?: string) => void;
  readonly selectMapping: (id?: string) => void;
  readonly selectBinding: (id?: string) => void;
  readonly openQuickStart: () => void;
  readonly closeQuickStart: () => void;
  readonly load: () => Promise<void>;
  readonly createSchema: (input: { readonly name: string; readonly content: JsonValue }) => Promise<SchemaDocument>;
  readonly setRules: (rules: readonly MappingRule[]) => void;
  readonly setActiveMapping: (id: string) => void;
  readonly createMapping: (input: { readonly name: string; readonly sourceSchemaId: string; readonly targetSchemaId: string; readonly rules: readonly MappingRule[] }) => Promise<MappingDocument>;
  readonly saveVersion: () => Promise<void>;
  readonly restoreVersion: (version: number) => Promise<void>;
  readonly runTransform: (input: JsonValue) => Promise<void>;
  readonly addBinding: (input: CreateProxyBindingRequest) => Promise<void>;
  readonly editBinding: (id: string, input: UpdateProxyBindingRequest) => Promise<void>;
  readonly removeBinding: (id: string) => Promise<void>;
  readonly loadSample: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "bindings",
  quickStartOpen: false,
  schemas: [],
  mappings: [],
  bindings: [],
  rules: [],
  status: "Ready",
  setView(view) {
    set({ view });
  },
  selectSchema(id) {
    set({ selectedSchemaId: id });
  },
  selectMapping(id) {
    const mapping = id ? get().mappings.find((item) => item.id === id) : undefined;
    set({
      selectedMappingId: id,
      activeMapping: mapping,
      rules: mapping?.versions.find((version) => version.version === mapping.currentVersion)?.rules ?? []
    });
  },
  selectBinding(id) {
    set({ selectedBindingId: id });
  },
  openQuickStart() {
    set({ quickStartOpen: true });
  },
  closeQuickStart() {
    set({ quickStartOpen: false });
  },
  async load() {
    const [schemas, mappings, bindings] = await Promise.all([listSchemas(), listMappings(), listBindings()]);
    set({ schemas, mappings, bindings });
  },
  async createSchema(input) {
    const schema = await createSchema(input);
    set({ schemas: [schema, ...get().schemas], status: `Schema ${schema.name} created` });
    return schema;
  },
  setRules(rules) {
    set({ rules });
  },
  setActiveMapping(id) {
    const mapping = get().mappings.find((item) => item.id === id);
    if (!mapping) return;
    set({
      activeMapping: mapping,
      rules: mapping.versions.find((version) => version.version === mapping.currentVersion)?.rules ?? []
    });
  },
  async createMapping(input) {
    const mapping = await createMapping({ name: input.name, sourceSchemaId: input.sourceSchemaId, targetSchemaId: input.targetSchemaId, rules: [...input.rules] });
    set({ activeMapping: mapping, mappings: [mapping, ...get().mappings], status: `Mapping ${mapping.name} created`, rules: [...input.rules] });
    return mapping;
  },
  async saveVersion() {
    const { activeMapping, rules } = get();
    if (!activeMapping) throw new Error("Select a mapping first.");
    const mapping = await createMappingVersion(activeMapping.id, [...rules]);
    set({ activeMapping: mapping, mappings: get().mappings.map((item) => (item.id === mapping.id ? mapping : item)), status: `Version ${mapping.currentVersion} saved` });
  },
  async restoreVersion(version) {
    const { activeMapping } = get();
    if (!activeMapping) throw new Error("Select a mapping first.");
    const mapping = await restoreMappingVersion(activeMapping.id, version);
    const rules = mapping.versions.find((item) => item.version === version)?.rules ?? [];
    set({ activeMapping: mapping, rules, mappings: get().mappings.map((item) => (item.id === mapping.id ? mapping : item)), status: `Restored version ${version}` });
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
      activeMapping: mapping,
      schemas: [sourceSchema, targetSchema, ...get().schemas],
      mappings: [mapping, ...get().mappings],
      rules,
      status: "Sample loaded — wire up a binding to test it"
    });
  }
}));
