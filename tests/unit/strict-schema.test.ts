// @vitest-environment node
/**
 * Tests for toStrictJsonSchema() — the OpenAI/DeepSeek strict-mode transformer.
 *
 * OpenAI strict mode rules:
 *   1. Every object node must have `additionalProperties: false`.
 *   2. Every object node must have a `required` array listing ALL its properties.
 *   3. Genuinely-optional fields must be represented as nullable (type union with null)
 *      rather than truly absent keys.
 */
import { describe, it, expect } from "vitest";
import { toStrictJsonSchema } from "@/lib/ai/strict-schema";
import {
  EXTRACT_PROFILE_JSON_SCHEMA,
  TAILOR_CV_JSON_SCHEMA,
  ExtractionResult,
  TailorResult,
} from "@/lib/schemas/llm-contracts";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Collect every object node in a JSON schema tree. */
function collectObjectNodes(node: unknown, path = ""): Array<{ path: string; node: Record<string, unknown> }> {
  if (typeof node !== "object" || node === null) return [];
  const obj = node as Record<string, unknown>;
  const results: Array<{ path: string; node: Record<string, unknown> }> = [];

  if (obj["type"] === "object" && typeof obj["properties"] === "object") {
    results.push({ path, node: obj });
  }
  // Recurse into properties.
  if (typeof obj["properties"] === "object") {
    for (const [k, v] of Object.entries(obj["properties"] as Record<string, unknown>)) {
      results.push(...collectObjectNodes(v, `${path}.properties.${k}`));
    }
  }
  // Recurse into array items.
  if (obj["items"]) {
    results.push(...collectObjectNodes(obj["items"], `${path}.items`));
  }
  // Recurse into combiners.
  for (const combiner of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(obj[combiner])) {
      for (const [i, sub] of (obj[combiner] as unknown[]).entries()) {
        results.push(...collectObjectNodes(sub, `${path}.${combiner}[${i}]`));
      }
    }
  }
  return results;
}

function assertStrictCompatible(schema: object, label: string) {
  const nodes = collectObjectNodes(schema);
  expect(nodes.length, `${label}: should have at least one object node`).toBeGreaterThan(0);

  for (const { path, node } of nodes) {
    const props = Object.keys((node["properties"] as Record<string, unknown>) ?? {});
    const required = Array.isArray(node["required"]) ? (node["required"] as string[]) : null;
    const addl = node["additionalProperties"];

    // Rule 1: additionalProperties must be false.
    expect(addl, `${label} @ ${path}: additionalProperties must be false`).toBe(false);

    // Rule 2: required must exist.
    expect(required, `${label} @ ${path}: required must be an array`).not.toBeNull();

    // Rule 3: required must list ALL property keys.
    for (const k of props) {
      expect(
        required,
        `${label} @ ${path}: property "${k}" must be in required`,
      ).toContain(k);
    }
  }
}

// ── Test: toStrictJsonSchema satisfies strict-mode rules ─────────────────────

describe("toStrictJsonSchema — structural contracts", () => {
  it("EXTRACT_PROFILE: every object node has additionalProperties:false and all-keys-required", () => {
    const strict = toStrictJsonSchema(EXTRACT_PROFILE_JSON_SCHEMA.schema);
    assertStrictCompatible(strict, "EXTRACT_PROFILE");
  });

  it("TAILOR_CV: every object node has additionalProperties:false and all-keys-required", () => {
    const strict = toStrictJsonSchema(TAILOR_CV_JSON_SCHEMA.schema);
    assertStrictCompatible(strict, "TAILOR_CV");
  });

  it("does not mutate the original schema", () => {
    const original = JSON.parse(JSON.stringify(EXTRACT_PROFILE_JSON_SCHEMA.schema));
    toStrictJsonSchema(EXTRACT_PROFILE_JSON_SCHEMA.schema);
    // The original schema does NOT have required on contact; that should be unchanged.
    expect(JSON.stringify(EXTRACT_PROFILE_JSON_SCHEMA.schema)).toBe(JSON.stringify(original));
  });

  it("makes previously-optional fields nullable (not missing)", () => {
    const strict = toStrictJsonSchema(EXTRACT_PROFILE_JSON_SCHEMA.schema) as Record<string, unknown>;
    const props = (strict["properties"] as Record<string, unknown>);

    // `leadership` was optional in the original schema — now must be in required.
    const required = strict["required"] as string[];
    expect(required).toContain("leadership");
    expect(required).toContain("languages");

    // leadership must be nullable (anyOf with null, or type includes null).
    const leadership = props["leadership"] as Record<string, unknown>;
    const isNullable =
      (Array.isArray(leadership["anyOf"]) &&
        (leadership["anyOf"] as unknown[]).some(
          (n) => (n as Record<string, unknown>)["type"] === "null",
        )) ||
      (Array.isArray(leadership["type"]) &&
        (leadership["type"] as string[]).includes("null"));
    expect(isNullable).toBe(true);
  });

  it("scalar optional field type becomes a two-element array with null", () => {
    const simple: object = {
      type: "object",
      additionalProperties: false,
      required: ["required_field"],
      properties: {
        required_field: { type: "string" },
        optional_field: { type: "string" },
        optional_num: { type: "number" },
      },
    };
    const strict = toStrictJsonSchema(simple) as Record<string, unknown>;
    const props = strict["properties"] as Record<string, { type: unknown }>;
    // required field untouched
    expect(props["required_field"]!.type).toBe("string");
    // optional fields made nullable
    expect(props["optional_field"]!.type).toEqual(["string", "null"]);
    expect(props["optional_num"]!.type).toEqual(["number", "null"]);
    // all in required
    expect(strict["required"]).toEqual(["required_field", "optional_field", "optional_num"]);
  });

  it("nested optional object becomes anyOf [..., {type:null}]", () => {
    const schema: object = {
      type: "object",
      additionalProperties: false,
      required: ["a"],
      properties: {
        a: { type: "string" },
        nested: {
          type: "object",
          additionalProperties: false,
          required: ["x"],
          properties: { x: { type: "string" } },
        },
      },
    };
    const strict = toStrictJsonSchema(schema) as Record<string, unknown>;
    const props = strict["properties"] as Record<string, unknown>;
    const nestedStrict = props["nested"] as Record<string, unknown>;
    // nested was optional (not in required) — should be wrapped in anyOf
    const anyOf = nestedStrict["anyOf"] as Array<Record<string, unknown>>;
    expect(Array.isArray(anyOf)).toBe(true);
    expect(anyOf.some((n) => n["type"] === "null")).toBe(true);
  });
});

// ── Test: Zod schemas still accept null-containing model responses ────────────

describe("Zod schemas accept null-normalized model responses", () => {
  it("ExtractionResult accepts a response with all optional fields omitted (the normal case)", () => {
    const payload = {
      header: { name: "Alice" },
      contact: {},
      experiences: [{ company: "ACME", role: "Engineer", bulletsFull: ["Did X."] }],
      education: [],
      skills: { professional: [], soft: [] },
    };
    expect(() => ExtractionResult.parse(payload)).not.toThrow();
  });

  it("ExtractionResult accepts null optionals after normalisation (null → undefined)", () => {
    // The model returns null for optional fields when sent a strict schema.
    // Callers should strip nulls before zod validation.
    const rawFromModel = {
      header: { name: "Alice", title: null, website: null, summaryLong: null },
      contact: { email: "a@b.com", phone: null, location: null, linkedin: null },
      experiences: [
        {
          company: "ACME",
          role: "Engineer",
          period: null,
          location: null,
          bulletsFull: ["Did X."],
          tags: null,
          angles: null,
        },
      ],
      education: [{ institution: "MIT", degree: null, period: null, note: null }],
      skills: { professional: ["TS"], soft: [] },
      leadership: null,
      languages: null,
    };

    // Normalise: strip null values recursively (simulates what callers should do).
    function stripNulls(v: unknown): unknown {
      if (v === null) return undefined;
      if (Array.isArray(v)) return v.map(stripNulls).filter((x) => x !== undefined);
      if (typeof v === "object" && v !== null) {
        return Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .map(([k, val]) => [k, stripNulls(val)])
            .filter(([, val]) => val !== undefined),
        );
      }
      return v;
    }

    const normalised = stripNulls(rawFromModel);
    expect(() => ExtractionResult.parse(normalised)).not.toThrow();
  });

  it("TailorResult accepts a response with optional fields omitted", () => {
    const payload = {
      cvData: {
        header: { name: "Alice", title: "Engineer", summary: "Great." },
        contact: {},
        summary: "Great.",
        skills: { professional: ["TS"], soft: [] },
        experience: [
          {
            kbExperienceId: "exp-1",
            company: "ACME",
            role: "Engineer",
            bullets: ["Did X."],
          },
        ],
        education: [{ institution: "MIT" }],
      },
      rationale: [],
      templateSuggestion: "clean",
      warnings: [],
    };
    expect(() => TailorResult.parse(payload)).not.toThrow();
  });
});

// ── Test: strict schema of EXTRACT_PROFILE — contact has required ─────────────

describe("Specific schema nodes that were broken", () => {
  it("EXTRACT_PROFILE contact node gets a required array", () => {
    const strict = toStrictJsonSchema(EXTRACT_PROFILE_JSON_SCHEMA.schema) as Record<string, unknown>;
    const props = strict["properties"] as Record<string, unknown>;
    const contact = props["contact"] as Record<string, unknown>;
    expect(Array.isArray(contact["required"])).toBe(true);
    const required = contact["required"] as string[];
    expect(required).toContain("email");
    expect(required).toContain("phone");
    expect(required).toContain("location");
    expect(required).toContain("linkedin");
  });

  it("TAILOR_CV contact node gets a required array", () => {
    const strict = toStrictJsonSchema(TAILOR_CV_JSON_SCHEMA.schema) as Record<string, unknown>;
    const cvData = ((strict["properties"] as Record<string, unknown>)["cvData"]) as Record<string, unknown>;
    const cvProps = cvData["properties"] as Record<string, unknown>;
    const contact = cvProps["contact"] as Record<string, unknown>;
    expect(Array.isArray(contact["required"])).toBe(true);
    const required = contact["required"] as string[];
    expect(required).toContain("email");
    expect(required).toContain("phone");
    expect(required).toContain("location");
    expect(required).toContain("linkedin");
  });

  it("EXTRACT_PROFILE header node requires all properties including optional ones", () => {
    const strict = toStrictJsonSchema(EXTRACT_PROFILE_JSON_SCHEMA.schema) as Record<string, unknown>;
    const props = strict["properties"] as Record<string, unknown>;
    const header = props["header"] as Record<string, unknown>;
    const required = header["required"] as string[];
    expect(required).toContain("name");
    expect(required).toContain("title");
    expect(required).toContain("website");
    expect(required).toContain("summaryLong");
    // name was originally required — its type should stay string.
    const headerProps = header["properties"] as Record<string, { type: unknown }>;
    expect(headerProps["name"]!.type).toBe("string");
    // title was originally optional — now nullable.
    expect(headerProps["title"]!.type).toEqual(["string", "null"]);
  });

  it("TAILOR_CV rationale items require jdSignal (was optional)", () => {
    const strict = toStrictJsonSchema(TAILOR_CV_JSON_SCHEMA.schema) as Record<string, unknown>;
    const props = strict["properties"] as Record<string, unknown>;
    const rationale = props["rationale"] as Record<string, unknown>;
    const items = rationale["items"] as Record<string, unknown>;
    const required = items["required"] as string[];
    expect(required).toContain("jdSignal");
    // jdSignal was optional — should be nullable.
    const itemProps = items["properties"] as Record<string, { type: unknown }>;
    expect(itemProps["jdSignal"]!.type).toEqual(["string", "null"]);
  });
});
