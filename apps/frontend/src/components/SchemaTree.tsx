import type { SchemaField } from "@schemabridge/shared-types";
import { Braces, ListTree, Type } from "lucide-react";

interface Props {
  readonly title: string;
  readonly fields: readonly SchemaField[];
  readonly selected?: string;
  readonly onSelect?: (path: string) => void;
}

export function SchemaTree({ title, fields, selected, onSelect }: Props) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <ListTree className="h-4 w-4" /> {title}
      </div>
      <div className="space-y-1">{fields.map((field) => <TreeItem key={field.path} field={field} depth={0} selected={selected} onSelect={onSelect} />)}</div>
    </div>
  );
}

function TreeItem({ field, depth, selected, onSelect }: { readonly field: SchemaField; readonly depth: number; readonly selected?: string; readonly onSelect?: (path: string) => void }) {
  const isSelected = selected === field.path;
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect?.(field.path)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${isSelected ? "bg-teal-50 text-primary" : "hover:bg-muted"}`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {field.kind === "object" || field.kind === "array" ? <Braces className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
        <span className="truncate font-medium">{field.label}</span>
        <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{field.kind}</span>
      </button>
      {field.children.map((child) => <TreeItem key={child.path} field={child} depth={depth + 1} selected={selected} onSelect={onSelect} />)}
    </div>
  );
}
