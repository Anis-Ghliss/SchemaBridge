import type { MappingRule, SchemaField } from "@schemabridge/shared-types";
import { Trash2 } from "lucide-react";
import ReactFlow, { Background, Controls, Position, type Edge, type EdgeMouseHandler, type Node, type OnConnect, type OnEdgesDelete } from "reactflow";
import "reactflow/dist/style.css";
import { useMemo, useState } from "react";

interface Props {
  readonly sourceFields: readonly SchemaField[];
  readonly targetFields: readonly SchemaField[];
  readonly rules: readonly MappingRule[];
  readonly onRulesChange: (rules: readonly MappingRule[]) => void;
}

export function MappingCanvas({ sourceFields, targetFields, rules, onRulesChange }: Props) {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const sourceLeaves = useMemo(() => flatten(sourceFields).filter((field) => field.children.length === 0), [sourceFields]);
  const targetLeaves = useMemo(() => flatten(targetFields).filter((field) => field.children.length === 0), [targetFields]);

  const nodes: Node[] = [
    ...sourceLeaves.map((field, index) => ({
      id: `source:${field.path}`,
      position: { x: 40, y: 40 + index * 72 },
      data: { label: field.path },
      sourcePosition: Position.Right,
      targetPosition: Position.Left
    })),
    ...targetLeaves.map((field, index) => ({
      id: `target:${field.path}`,
      position: { x: 520, y: 40 + index * 72 },
      data: { label: field.path },
      sourcePosition: Position.Right,
      targetPosition: Position.Left
    }))
  ];

  const edges: Edge[] = rules.map((rule) => ({
    id: rule.id,
    source: `source:${rule.sourcePath}`,
    target: `target:${rule.targetPath}`,
    animated: true,
    style: { stroke: "hsl(0 0% 9%)", strokeWidth: 1.5 }
  }));

	  const onConnect: OnConnect = (connection) => {
    if (!connection.source || !connection.target) return;
    const sourcePath = connection.source.replace(/^source:/, "");
    const targetPath = connection.target.replace(/^target:/, "");
    if (sourcePath === connection.source || targetPath === connection.target) return;
    const nextRules = rules.filter((rule) => rule.targetPath !== targetPath);
	    onRulesChange([...nextRules, { id: crypto.randomUUID(), sourcePath, targetPath }]);
	  };

  const removeRules = (ids: ReadonlySet<string>) => {
    if (ids.size === 0) return;
    onRulesChange(rules.filter((rule) => !ids.has(rule.id)));
    if (selectedEdgeId && ids.has(selectedEdgeId)) setSelectedEdgeId(undefined);
  };

  const onEdgesDelete: OnEdgesDelete = (deletedEdges) => {
    removeRules(new Set(deletedEdges.map((edge) => edge.id)));
  };

  const onEdgeClick: EdgeMouseHandler = (_event, edge) => {
    setSelectedEdgeId(edge.id);
  };

  const onEdgeDoubleClick: EdgeMouseHandler = (_event, edge) => {
    removeRules(new Set([edge.id]));
  };

  const deleteSelected = () => {
    if (!selectedEdgeId) return;
    removeRules(new Set([selectedEdgeId]));
  };

  return (
    <div className="relative h-[520px] overflow-hidden rounded-lg border border-border bg-white">
      {selectedEdgeId && (
        <button
          type="button"
          onClick={deleteSelected}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
          aria-label="Delete selected link"
          title="Delete selected link"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onEdgeClick={onEdgeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={() => setSelectedEdgeId(undefined)}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
      >
        <Background color="#cbd5e1" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function flatten(fields: readonly SchemaField[]): readonly SchemaField[] {
  return fields.flatMap((field) => [field, ...flatten(field.children)]);
}
