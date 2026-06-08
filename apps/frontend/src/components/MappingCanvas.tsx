import type { MappingRule, SchemaField } from "@schemabridge/shared-types";
import ReactFlow, { Background, Controls, Position, type Edge, type Node, type OnConnect } from "reactflow";
import "reactflow/dist/style.css";
import { useMemo } from "react";

interface Props {
  readonly sourceFields: readonly SchemaField[];
  readonly targetFields: readonly SchemaField[];
  readonly rules: readonly MappingRule[];
  readonly onRulesChange: (rules: readonly MappingRule[]) => void;
}

export function MappingCanvas({ sourceFields, targetFields, rules, onRulesChange }: Props) {
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
    style: { stroke: "hsl(173 80% 31%)", strokeWidth: 2 }
  }));

  const onConnect: OnConnect = (connection) => {
    if (!connection.source || !connection.target) return;
    const sourcePath = connection.source.replace(/^source:/, "");
    const targetPath = connection.target.replace(/^target:/, "");
    if (sourcePath === connection.source || targetPath === connection.target) return;
    const nextRules = rules.filter((rule) => rule.targetPath !== targetPath);
    onRulesChange([...nextRules, { id: crypto.randomUUID(), sourcePath, targetPath }]);
  };

  return (
    <div className="h-[520px] overflow-hidden rounded-lg border border-border bg-white">
      <ReactFlow nodes={nodes} edges={edges} onConnect={onConnect} fitView>
        <Background color="#cbd5e1" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function flatten(fields: readonly SchemaField[]): readonly SchemaField[] {
  return fields.flatMap((field) => [field, ...flatten(field.children)]);
}
