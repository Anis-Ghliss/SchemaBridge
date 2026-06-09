import type { CreateProxyAppRequest, CreateProxyBindingRequest, JsonValue, MappingDocument, MappingRule, ProxyApp, ProxyAppWithKey, ProxyBinding, SchemaDocument, UpdateProxyAppRequest, UpdateProxyBindingRequest, UpdateSchemaRequest } from "@schemabridge/shared-types";
import { create } from "zustand";
import {
  createBinding,
  createMapping,
  createMappingVersion,
  createProxyApp,
  createSchema,
  deleteBinding,
  deleteMapping,
  deleteProxyApp,
  deleteSchema,
  listBindings,
  listMappings,
  listProxyApps,
  listSchemas,
  restoreMappingVersion,
  rotateProxyAppKey,
  transform,
  updateBinding,
  updateCurrentMappingVersion,
  updateProxyApp,
  updateSchema
} from "./lib/api";

export type ResourceView = "schemas" | "mappings" | "bindings" | "apps" | "live" | "drift";

export interface AppDialog {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: "default" | "danger";
  readonly showCancel?: boolean;
}

interface PendingDialog extends AppDialog {
  readonly resolve: (confirmed: boolean) => void;
}

interface AppState {
  readonly view: ResourceView;
  readonly unsavedChange?: { readonly id: string; readonly message: string };
  readonly dialog?: PendingDialog;
  readonly selectedSchemaId?: string;
  readonly selectedMappingId?: string;
  readonly selectedBindingId?: string;
  readonly quickStartOpen: boolean;
  readonly schemas: readonly SchemaDocument[];
  readonly mappings: readonly MappingDocument[];
  readonly bindings: readonly ProxyBinding[];
  readonly apps: readonly ProxyApp[];
  readonly selectedAppId?: string;
  readonly revealedKey?: ProxyAppWithKey;
  readonly activeMapping?: MappingDocument;
  readonly rules: readonly MappingRule[];
  readonly status: string;
  readonly output?: JsonValue;
  readonly error?: string;
  readonly setView: (view: ResourceView) => Promise<boolean>;
  readonly setUnsavedChange: (change?: { readonly id: string; readonly message: string }) => void;
  readonly confirmUnsavedChange: () => Promise<boolean>;
  readonly confirmDialog: (dialog: Omit<AppDialog, "id">) => Promise<boolean>;
  readonly alertDialog: (dialog: Omit<AppDialog, "id" | "showCancel" | "cancelLabel">) => Promise<void>;
  readonly resolveDialog: (confirmed: boolean) => void;
  readonly selectSchema: (id?: string) => void;
  readonly selectMapping: (id?: string) => void;
  readonly selectBinding: (id?: string) => void;
  readonly openQuickStart: () => void;
  readonly closeQuickStart: () => void;
  readonly load: () => Promise<void>;
  readonly createSchema: (input: { readonly name: string; readonly content: JsonValue }) => Promise<SchemaDocument>;
  readonly editSchema: (id: string, input: UpdateSchemaRequest) => Promise<void>;
  readonly removeSchema: (id: string, options?: { readonly cascade?: boolean }) => Promise<void>;
  readonly removeMapping: (id: string, options?: { readonly cascade?: boolean }) => Promise<void>;
  readonly setRules: (rules: readonly MappingRule[]) => void;
  readonly setActiveMapping: (id: string) => void;
  readonly createMapping: (input: { readonly name: string; readonly sourceSchemaId: string; readonly targetSchemaId: string; readonly rules: readonly MappingRule[] }) => Promise<MappingDocument>;
  readonly saveMapping: () => Promise<void>;
  readonly createVersion: () => Promise<void>;
  readonly restoreVersion: (version: number) => Promise<void>;
  readonly runTransform: (input: JsonValue) => Promise<void>;
  readonly addBinding: (input: CreateProxyBindingRequest) => Promise<void>;
  readonly editBinding: (id: string, input: UpdateProxyBindingRequest) => Promise<void>;
  readonly removeBinding: (id: string) => Promise<void>;
  readonly selectApp: (id?: string) => void;
  readonly addApp: (input: CreateProxyAppRequest) => Promise<ProxyAppWithKey>;
  readonly editApp: (id: string, input: UpdateProxyAppRequest) => Promise<void>;
  readonly rotateAppKey: (id: string) => Promise<ProxyAppWithKey>;
  readonly removeApp: (id: string) => Promise<void>;
  readonly clearRevealedKey: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "bindings",
  quickStartOpen: false,
  schemas: [],
  mappings: [],
  bindings: [],
  apps: [],
  rules: [],
  status: "Ready",
  async setView(view) {
    const current = get();
    if (current.view !== view && current.unsavedChange) {
      if (!(await get().confirmUnsavedChange())) return false;
    }
    if (current.view !== view) {
      set({
        view,
        selectedSchemaId: undefined,
        selectedMappingId: undefined,
        selectedBindingId: undefined,
        selectedAppId: undefined,
        activeMapping: undefined,
        rules: []
      });
      return true;
    }
    set({ view });
    return true;
  },
  setUnsavedChange(change) {
    set({ unsavedChange: change });
  },
  async confirmUnsavedChange() {
    const change = get().unsavedChange;
    if (!change) return true;
    const confirmed = await get().confirmDialog({
      title: "Discard unsaved changes?",
      description: change.message,
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      variant: "danger"
    });
    if (confirmed) set({ unsavedChange: undefined });
    return confirmed;
  },
  confirmDialog(dialog) {
    return new Promise<boolean>((resolve) => {
      set({ dialog: { ...dialog, id: crypto.randomUUID(), resolve, showCancel: true } });
    });
  },
  async alertDialog(dialog) {
    await get().confirmDialog({ ...dialog, confirmLabel: dialog.confirmLabel ?? "OK", showCancel: false });
  },
  resolveDialog(confirmed) {
    const dialog = get().dialog;
    if (!dialog) return;
    set({ dialog: undefined });
    dialog.resolve(confirmed);
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
    const [schemas, mappings, bindings, apps] = await Promise.all([listSchemas(), listMappings(), listBindings(), listProxyApps()]);
    set({ schemas, mappings, bindings, apps });
  },
  async createSchema(input) {
    const schema = await createSchema(input);
    set({ schemas: [schema, ...get().schemas], status: `Schema ${schema.name} created` });
    return schema;
  },
  async editSchema(id, input) {
    const schema = await updateSchema(id, input);
    set({ schemas: get().schemas.map((item) => (item.id === id ? schema : item)), status: `Schema ${schema.name} updated` });
  },
  async removeSchema(id, options) {
    await deleteSchema(id, options);
    const [schemas, mappings, bindings] = await Promise.all([listSchemas(), listMappings(), listBindings()]);
    set({ schemas, mappings, bindings, selectedSchemaId: undefined, selectedMappingId: undefined, selectedBindingId: undefined, activeMapping: undefined, rules: [], status: "Schema removed" });
  },
  async removeMapping(id, options) {
    await deleteMapping(id, options);
    const [mappings, bindings] = await Promise.all([listMappings(), listBindings()]);
    set({ mappings, bindings, selectedMappingId: undefined, selectedBindingId: undefined, activeMapping: undefined, rules: [], status: "Mapping removed" });
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
  async saveMapping() {
    const { activeMapping, rules } = get();
    if (!activeMapping) throw new Error("Select a mapping first.");
    const mapping = await updateCurrentMappingVersion(activeMapping.id, [...rules]);
    set({ activeMapping: mapping, mappings: get().mappings.map((item) => (item.id === mapping.id ? mapping : item)), status: `Version ${mapping.currentVersion} updated` });
  },
  async createVersion() {
    const { activeMapping, rules } = get();
    if (!activeMapping) throw new Error("Select a mapping first.");
    const mapping = await createMappingVersion(activeMapping.id, [...rules]);
    set({ activeMapping: mapping, mappings: get().mappings.map((item) => (item.id === mapping.id ? mapping : item)), status: `Version ${mapping.currentVersion} created` });
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
  selectApp(id) {
    set({ selectedAppId: id });
  },
  async addApp(input) {
    const result = await createProxyApp(input);
    const summary = stripKey(result);
    set({ apps: [...get().apps, summary], revealedKey: result, status: `App ${result.name} created` });
    return result;
  },
  async editApp(id, input) {
    const app = await updateProxyApp(id, input);
    set({ apps: get().apps.map((item) => (item.id === id ? app : item)), status: `App ${app.name} updated` });
  },
  async rotateAppKey(id) {
    const result = await rotateProxyAppKey(id);
    const summary = stripKey(result);
    set({ apps: get().apps.map((item) => (item.id === id ? summary : item)), revealedKey: result, status: `Key rotated for ${result.name}` });
    return result;
  },
  async removeApp(id) {
    await deleteProxyApp(id);
    set({ apps: get().apps.filter((item) => item.id !== id), selectedAppId: undefined, status: "App removed" });
  },
  clearRevealedKey() {
    set({ revealedKey: undefined });
  },
}));

function stripKey(result: ProxyAppWithKey): ProxyApp {
  return {
    id: result.id,
    name: result.name,
    description: result.description,
    keyPrefix: result.keyPrefix,
    scope: result.scope,
    bindingIds: result.bindingIds,
    enabled: result.enabled,
    lastUsedAt: result.lastUsedAt,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt
  };
}
