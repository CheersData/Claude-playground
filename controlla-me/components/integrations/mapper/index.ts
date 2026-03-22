// Visual Entity Mapper — barrel exports + shared types

// ─── Types ──────────────────────────────────────────────────────────

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "object"
  | "array"
  | "enum";

export interface SchemaField {
  id: string;
  name: string;
  type: FieldType;
  required?: boolean;
  description?: string;
  children?: SchemaField[];
}

export interface SchemaEntity {
  id: string;
  name: string;
  icon?: string;
  fields: SchemaField[];
  recordCount?: number;
}

export interface TransformRule {
  type: "direct" | "rename" | "format" | "concat" | "split" | "custom";
  config?: Record<string, unknown>;
  expression?: string;
  label?: string;
}

export interface FieldMappingEntry {
  id: string;
  sourceFieldId: string;
  targetFieldId: string;
  transform?: TransformRule;
  confidence?: number;
  autoMapped?: boolean;
}

export interface MappingState {
  entityId: string;
  mappings: FieldMappingEntry[];
}

export interface EntityRelationship {
  from: string;
  to: string;
  type: "one-to-one" | "one-to-many" | "many-to-many";
  label?: string;
}

// ─── Components ─────────────────────────────────────────────────────

export { default as FieldNode } from "./FieldNode";
export { default as SchemaExplorer } from "./SchemaExplorer";
export { default as TargetSchemaPanel } from "./TargetSchemaPanel";
export { default as MappingLine } from "./MappingLine";
export { default as MappingCanvas } from "./MappingCanvas";
export { default as AutoSuggestBanner } from "./AutoSuggestBanner";
export { default as TransformEditor } from "./TransformEditor";
export { default as EntitySelector } from "./EntitySelector";
export { default as MappingToolbar } from "./MappingToolbar";
export { default as SchemaDiscoveryModal } from "./SchemaDiscoveryModal";
export { default as RelationshipGraph } from "./RelationshipGraph";
export { default as MappingPreview } from "./MappingPreview";
export { default as ValidationPanel } from "./ValidationPanel";
export { default as AutoMapSuggestions } from "./AutoMapSuggestions";
export { default as MappingStats } from "./MappingStats";

// ─── Re-export sub-component types ─────────────────────────────────

export type { ValidationSeverity, ValidationIssue } from "./ValidationPanel";
export type { MappingSuggestion } from "./AutoMapSuggestions";
