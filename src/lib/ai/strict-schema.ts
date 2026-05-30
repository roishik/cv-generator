/**
 * toStrictJsonSchema — make a JSON Schema compatible with OpenAI structured-output
 * strict mode (and DeepSeek's equivalent).
 *
 * OpenAI strict mode requires, for EVERY object node:
 *   1. `additionalProperties: false`
 *   2. A `required` array that lists ALL properties defined in that object.
 *
 * Because strict mode doesn't support truly-absent optional keys, the standard
 * pattern is to keep the key in `required` but allow `null` as a type
 * (e.g. `{ "type": ["string","null"] }`).  We apply that transformation to any
 * property whose key was NOT already present in the original `required` array.
 *
 * The original schemas (used by Anthropic tool-use and for Zod validation) are
 * left untouched; callers receive a deep-cloned, strict-compatible copy.
 *
 * PURE: no I/O, no side-effects, no imports.
 */

type JsonSchemaNode = Record<string, unknown>;

/**
 * Derive an OpenAI-strict-compatible copy of a JSON Schema object.
 * Works recursively on object nodes, array item schemas, and allOf/anyOf/oneOf.
 */
export function toStrictJsonSchema(schema: object): object {
  return processNode(JSON.parse(JSON.stringify(schema)) as JsonSchemaNode);
}

function processNode(node: JsonSchemaNode): JsonSchemaNode {
  if (typeof node !== "object" || node === null) return node;

  // Recurse into array schemas (items).
  if (node["type"] === "array" && isObject(node["items"])) {
    node["items"] = processNode(node["items"] as JsonSchemaNode);
  }

  // Recurse into combiners.
  for (const combiner of ["allOf", "anyOf", "oneOf"] as const) {
    if (Array.isArray(node[combiner])) {
      node[combiner] = (node[combiner] as JsonSchemaNode[]).map(processNode);
    }
  }

  // Handle object nodes.
  if (node["type"] === "object" && isObject(node["properties"])) {
    const props = node["properties"] as Record<string, JsonSchemaNode>;
    const existingRequired = Array.isArray(node["required"])
      ? (node["required"] as string[])
      : [];

    // Build the full required array (all property keys).
    const allKeys = Object.keys(props);

    // For keys that were NOT already required, make their type nullable.
    for (const key of allKeys) {
      if (!existingRequired.includes(key)) {
        props[key] = makeNullable(props[key]!);
      }
    }

    // Recurse into every property.
    for (const key of allKeys) {
      props[key] = processNode(props[key]!);
    }

    // Enforce strict-mode constraints.
    node["required"] = allKeys;
    node["additionalProperties"] = false;
  }

  return node;
}

/**
 * Wrap a schema node so that `null` is also a valid value.
 * Handles plain `{ "type": "string" }`, type arrays, and bare object schemas.
 */
function makeNullable(node: JsonSchemaNode): JsonSchemaNode {
  if (typeof node !== "object" || node === null) return node;

  // Already nullable — nothing to do.
  if (Array.isArray(node["type"]) && (node["type"] as string[]).includes("null")) {
    return node;
  }
  if (node["type"] === "null") return node;

  // Simple scalar type: "string" | "number" | "integer" | "boolean".
  if (typeof node["type"] === "string" && node["type"] !== "object" && node["type"] !== "array") {
    return { ...node, type: [node["type"], "null"] };
  }

  // Object or array types: wrap in anyOf so the whole sub-schema OR null is valid.
  return { anyOf: [node, { type: "null" }] };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
