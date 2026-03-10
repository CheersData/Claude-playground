/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: Plugin Registry — Generic connector/store registration and resolution
 *
 * Covers:
 * - registerGenericConnector / resolveGenericConnector
 * - registerGenericStore / resolveGenericStore (composite key + plain key)
 * - registerConnector / resolveConnector (legacy)
 * - registerModel / resolveModel (composite key pattern)
 * - listRegistered includes generic entries
 * - Error messages for unregistered connectors/stores/models
 *
 * NOTE: The plugin-registry module calls registerDefaults() at import time,
 * which registers built-in connectors. These tests work WITH those defaults.
 */

import { describe, it, expect } from "vitest";

import {
  registerGenericConnector,
  resolveGenericConnector,
  registerGenericStore,
  resolveGenericStore,
  registerConnector,
  resolveConnector,
  registerModel,
  resolveModel,
  registerStore,
  listRegistered,
} from "@/lib/staff/data-connector/plugin-registry";
import type { DataSource } from "@/lib/staff/data-connector/types";

// ─── Helpers ───

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "test-source",
    name: "Test Source",
    shortName: "test",
    dataType: "test-data",
    vertical: "test",
    connector: "test-connector",
    config: {},
    lifecycle: { status: "active", fullLoadDone: false },
    estimatedItems: 0,
    ...overrides,
  } as DataSource;
}

const noop = () => {};

// =============================================================================
// registerGenericConnector / resolveGenericConnector
// =============================================================================

describe("Generic Connector Registration", () => {
  it("registers and resolves a generic connector", () => {
    const mockConnector = {
      connect: async () => [],
      testConnection: async () => true,
    };

    registerGenericConnector<{ id: string }>("test-generic-conn", (_source, _log) => mockConnector as any);

    const source = makeSource({ connector: "test-generic-conn" });
    const resolved = resolveGenericConnector(source, noop);

    expect(resolved).toBeDefined();
    expect(resolved).toBe(mockConnector);
  });

  it("throws for unregistered generic connector", () => {
    const source = makeSource({ connector: "nonexistent-connector-xyz" });

    expect(() => resolveGenericConnector(source, noop)).toThrow(
      'Connettore non registrato: "nonexistent-connector-xyz"'
    );
  });

  it("falls back to legacy registry when not in generic registry", () => {
    const mockConnector = { connect: async () => [], testConnection: async () => true };

    registerConnector("legacy-test-conn", (_source, _log) => mockConnector as any);

    const source = makeSource({ connector: "legacy-test-conn" });
    const resolved = resolveGenericConnector(source, noop);

    expect(resolved).toBeDefined();
  });
});

// =============================================================================
// registerGenericStore / resolveGenericStore
// =============================================================================

describe("Generic Store Registration", () => {
  it("registers and resolves by composite key 'dataType:connector'", () => {
    const mockStore = { load: async () => 0 };

    registerGenericStore("test-records:test-provider", (_source, _log) => mockStore as any);

    const source = makeSource({
      dataType: "test-records" as any,
      connector: "test-provider",
    });
    const resolved = resolveGenericStore(source, noop);

    expect(resolved).toBeDefined();
    expect(resolved).toBe(mockStore);
  });

  it("falls back to plain dataType key when composite key not found", () => {
    const mockStore = { load: async () => 0 };

    registerGenericStore("plain-test-type", (_source, _log) => mockStore as any);

    const source = makeSource({
      dataType: "plain-test-type" as any,
      connector: "some-other-connector",
    });
    const resolved = resolveGenericStore(source, noop);

    expect(resolved).toBeDefined();
    expect(resolved).toBe(mockStore);
  });

  it("falls back to legacy store registry", () => {
    const mockStore = { load: async () => 0 };

    registerStore("legacy-test-type" as any, (_source, _log) => mockStore as any);

    const source = makeSource({
      dataType: "legacy-test-type" as any,
      connector: "irrelevant",
    });
    const resolved = resolveGenericStore(source, noop);

    expect(resolved).toBeDefined();
  });

  it("throws for unregistered store", () => {
    const source = makeSource({
      dataType: "nonexistent-type-xyz" as any,
      connector: "unknown",
    });

    expect(() => resolveGenericStore(source, noop)).toThrow(
      'Store non registrato per dataType: "nonexistent-type-xyz"'
    );
  });
});

// =============================================================================
// resolveModel — composite key pattern
// =============================================================================

describe("resolveModel — composite key", () => {
  it("resolves model by composite key 'dataType:connector'", () => {
    const mockModel = { verify: async () => ({ valid: [], invalid: [] }) };

    registerModel("model-test:my-connector", (_source) => mockModel as any);

    const source = makeSource({
      dataType: "model-test" as any,
      connector: "my-connector",
    });
    const resolved = resolveModel(source);

    expect(resolved).toBe(mockModel);
  });

  it("falls back to plain dataType when composite key not found", () => {
    const mockModel = { verify: async () => ({ valid: [], invalid: [] }) };

    registerModel("model-plain-test" as any, (_source) => mockModel as any);

    const source = makeSource({
      dataType: "model-plain-test" as any,
      connector: "other",
    });
    const resolved = resolveModel(source);

    expect(resolved).toBe(mockModel);
  });

  it("throws for unregistered model", () => {
    const source = makeSource({
      dataType: "nonexistent-model-type" as any,
      connector: "unknown",
    });

    expect(() => resolveModel(source)).toThrow(
      'Model non registrato per dataType: "nonexistent-model-type"'
    );
  });
});

// =============================================================================
// listRegistered
// =============================================================================

describe("listRegistered", () => {
  it("returns an object with all registry categories", () => {
    const result = listRegistered();

    expect(result).toHaveProperty("connectors");
    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("stores");
    expect(result).toHaveProperty("genericConnectors");
    expect(result).toHaveProperty("genericStores");
  });

  it("includes built-in connectors from registerDefaults()", () => {
    const result = listRegistered();

    // These are registered in registerDefaults()
    expect(result.connectors).toContain("normattiva");
    expect(result.connectors).toContain("eurlex");
    expect(result.connectors).toContain("ncbi-bookshelf");
    expect(result.connectors).toContain("europe-pmc");
    expect(result.connectors).toContain("openstax");
  });

  it("includes built-in generic connectors", () => {
    const result = listRegistered();

    expect(result.genericConnectors).toContain("hubspot");
    expect(result.genericConnectors).toContain("salesforce");
    expect(result.genericConnectors).toContain("google-drive");
  });

  it("includes built-in generic stores", () => {
    const result = listRegistered();

    expect(result.genericStores).toContain("crm-records:hubspot");
    expect(result.genericStores).toContain("crm-records:salesforce");
    expect(result.genericStores).toContain("crm-records:google-drive");
  });

  it("includes built-in models", () => {
    const result = listRegistered();

    expect(result.models).toContain("legal-articles");
    expect(result.models).toContain("hr-articles");
    expect(result.models).toContain("medical-articles");
    expect(result.models).toContain("crm-records:hubspot");
    expect(result.models).toContain("crm-records:salesforce");
    expect(result.models).toContain("crm-records:google-drive");
  });

  it("includes built-in stores", () => {
    const result = listRegistered();

    expect(result.stores).toContain("legal-articles");
    expect(result.stores).toContain("hr-articles");
    expect(result.stores).toContain("medical-articles");
  });

  it("includes custom-registered entries", () => {
    registerGenericConnector("custom-test-list-conn", () => ({} as any));
    registerGenericStore("custom-test-list-store", () => ({} as any));

    const result = listRegistered();

    expect(result.genericConnectors).toContain("custom-test-list-conn");
    expect(result.genericStores).toContain("custom-test-list-store");
  });
});

// =============================================================================
// resolveConnector (legacy)
// =============================================================================

describe("resolveConnector (legacy)", () => {
  it("resolves a registered legacy connector", () => {
    const mockConnector = { connect: async () => [] };
    registerConnector("resolve-legacy-test", (_source, _log) => mockConnector as any);

    const source = makeSource({ connector: "resolve-legacy-test" });
    const resolved = resolveConnector(source, noop);

    expect(resolved).toBe(mockConnector);
  });

  it("throws for unregistered legacy connector", () => {
    const source = makeSource({ connector: "unregistered-legacy-xyz" });

    expect(() => resolveConnector(source, noop)).toThrow(
      'Connettore non registrato: "unregistered-legacy-xyz"'
    );
  });
});
