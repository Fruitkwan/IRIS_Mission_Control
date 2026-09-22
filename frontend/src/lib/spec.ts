// Access to the bundled OpenAPI spec (with injected operationIds).
import spec from '../../../spec/mainspec_v2.with-ids.json';

export type SchemaObject = {
  type?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  enum?: (string | number)[];
  required?: string[];
  description?: string;
  format?: string;
  $ref?: string;
  additionalProperties?: boolean | SchemaObject;
  example?: unknown;
  default?: unknown;
};

export type OperationObject = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ({ name?: string; in?: string; required?: boolean; schema?: SchemaObject; description?: string; $ref?: string })[];
  requestBody?: { content?: Record<string, { schema?: SchemaObject }> };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: SchemaObject }> }>;
};

export const apiSpec = spec as unknown as {
  paths: Record<string, Record<string, OperationObject> & { parameters?: ParamRef[] }>;
  components: {
    schemas: Record<string, SchemaObject>;
    parameters?: Record<string, ApiParam>;
  };
};

type ParamRef = { $ref?: string } & Partial<ApiParam>;

export type ApiParam = {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
  example?: unknown;
};

function resolveParam(p: ParamRef): ApiParam | undefined {
  if (p.$ref) {
    const name = p.$ref.replace('#/components/parameters/', '');
    return apiSpec.components.parameters?.[name];
  }
  return p as ApiParam;
}

// All query params for an operation (path-level + op-level).
export function opQueryParams(path: string, op: OperationObject): ApiParam[] {
  const pathLevel = apiSpec.paths[path]?.parameters ?? [];
  const all = [...pathLevel, ...(op.parameters ?? [])];
  return all
    .map(resolveParam)
    .filter((p): p is ApiParam => !!p && p.in === 'query');
}

export function resolveSchema(s: SchemaObject | undefined, depth = 0): SchemaObject | undefined {
  if (!s) return s;
  if (s.$ref && depth < 10) {
    const name = s.$ref.replace('#/components/schemas/', '');
    return resolveSchema(apiSpec.components.schemas[name], depth + 1) ?? s;
  }
  return s;
}

export function findOperation(
  operationId: string,
): { method: string; path: string; op: OperationObject } | undefined {
  for (const [path, ops] of Object.entries(apiSpec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      if (Array.isArray(op)) continue;
      if ((op as OperationObject).operationId === operationId)
        return { method, path, op: op as OperationObject };
    }
  }
  return undefined;
}

export function requestSchema(operationId: string): SchemaObject | undefined {
  const found = findOperation(operationId);
  const s = found?.op.requestBody?.content?.['application/json']?.schema;
  return resolveSchema(s);
}
