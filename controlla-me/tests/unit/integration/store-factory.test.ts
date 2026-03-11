/**
 * Tests: StoreFactory — Generic store plugin registry.
 *
 * Covers:
 * - register and retrieve plugins
 * - registerComposite with connector-specific stores
 * - getStore fallback from composite to simple
 * - has() checks
 * - listRegistered returns all types
 * - unregister removes plugin
 * - clear removes all plugins
 * - getStoreFactory singleton
 *
 * Pure in-memory registry — no mocks needed.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  StoreFactory,
  getStoreFactory,
  type StorePlugin,
  type StorePluginResult,
} from "@/lib/staff/data-connector/stores/store-factory";
import type { DataType } from "@/lib/staff/data-connector/types";

// ─── Helpers ───

function makePlugin(dataType: DataType): StorePlugin {
  return {
    dataType,
    validate: () => true,
    store: async () => ({ stored: 0, errors: 0 }),
  };
}

function makePluginWithValidation(
  dataType: DataType,
  validateFn: (item: unknown) => boolean
): StorePlugin {
  return {
    dataType,
    validate: validateFn,
    store: async (items) => ({
      stored: items.length,
      errors: 0,
    }),
  };
}

// ── Setup ───────────────────────────────────────────────────────────────────

let factory: StoreFactory;

beforeEach(() => {
  factory = new StoreFactory();
});

// =============================================================================
// register and retrieve
// =============================================================================

describe("register and retrieve", () => {
  it("registers a plugin and retrieves it by dataType", () => {
    const plugin = makePlugin("contacts");
    factory.register(plugin);

    const retrieved = factory.getStore("contacts");
    expect(retrieved).toBe(plugin);
  });

  it("returns undefined for unregistered dataType", () => {
    const retrieved = factory.getStore("contacts");
    expect(retrieved).toBeUndefined();
  });

  it("overwrites existing plugin for same dataType", () => {
    const plugin1 = makePlugin("contacts");
    const plugin2 = makePlugin("contacts");

    factory.register(plugin1);
    factory.register(plugin2);

    const retrieved = factory.getStore("contacts");
    expect(retrieved).toBe(plugin2);
    expect(retrieved).not.toBe(plugin1);
  });

  it("registers multiple plugins for different dataTypes", () => {
    const contactsPlugin = makePlugin("contacts");
    const invoicesPlugin = makePlugin("invoices");

    factory.register(contactsPlugin);
    factory.register(invoicesPlugin);

    expect(factory.getStore("contacts")).toBe(contactsPlugin);
    expect(factory.getStore("invoices")).toBe(invoicesPlugin);
  });
});

// =============================================================================
// registerComposite
// =============================================================================

describe("registerComposite", () => {
  it("registers with composite key 'dataType:connectorId'", () => {
    const plugin = makePlugin("contacts");
    factory.registerComposite("contacts", "hubspot", plugin);

    const retrieved = factory.getStore("contacts", "hubspot");
    expect(retrieved).toBe(plugin);
  });

  it("different connectors can have different plugins for same dataType", () => {
    const hubspotPlugin = makePlugin("contacts");
    const salesforcePlugin = makePlugin("contacts");

    factory.registerComposite("contacts", "hubspot", hubspotPlugin);
    factory.registerComposite("contacts", "salesforce", salesforcePlugin);

    expect(factory.getStore("contacts", "hubspot")).toBe(hubspotPlugin);
    expect(factory.getStore("contacts", "salesforce")).toBe(salesforcePlugin);
  });
});

// =============================================================================
// getStore — fallback from composite to simple
// =============================================================================

describe("getStore — fallback", () => {
  it("falls back to simple dataType when composite key not found", () => {
    const genericPlugin = makePlugin("contacts");
    factory.register(genericPlugin);

    // Query with connectorId that has no composite registration
    const retrieved = factory.getStore("contacts", "unknown-connector");
    expect(retrieved).toBe(genericPlugin);
  });

  it("composite key takes priority over simple dataType", () => {
    const genericPlugin = makePlugin("contacts");
    const specificPlugin = makePlugin("contacts");

    factory.register(genericPlugin);
    factory.registerComposite("contacts", "hubspot", specificPlugin);

    // With connectorId "hubspot" -> composite plugin
    expect(factory.getStore("contacts", "hubspot")).toBe(specificPlugin);

    // Without connectorId -> simple plugin
    expect(factory.getStore("contacts")).toBe(genericPlugin);
  });

  it("returns undefined when neither composite nor simple exists", () => {
    const result = factory.getStore("contacts", "hubspot");
    expect(result).toBeUndefined();
  });

  it("returns simple plugin when connectorId is not provided", () => {
    const plugin = makePlugin("invoices");
    factory.register(plugin);

    expect(factory.getStore("invoices")).toBe(plugin);
    expect(factory.getStore("invoices", undefined)).toBe(plugin);
  });
});

// =============================================================================
// has()
// =============================================================================

describe("has()", () => {
  it("returns true for registered simple dataType", () => {
    factory.register(makePlugin("contacts"));

    expect(factory.has("contacts")).toBe(true);
  });

  it("returns false for unregistered dataType", () => {
    expect(factory.has("contacts")).toBe(false);
  });

  it("returns true for registered composite key", () => {
    factory.registerComposite("contacts", "hubspot", makePlugin("contacts"));

    expect(factory.has("contacts", "hubspot")).toBe(true);
  });

  it("returns true when only simple key exists (checks simple as fallback)", () => {
    factory.register(makePlugin("contacts"));

    // has() with connectorId checks composite first, then simple
    expect(factory.has("contacts", "unknown")).toBe(true);
  });

  it("returns false when neither composite nor simple exists", () => {
    expect(factory.has("contacts", "hubspot")).toBe(false);
  });
});

// =============================================================================
// listRegistered
// =============================================================================

describe("listRegistered", () => {
  it("returns empty array for empty factory", () => {
    expect(factory.listRegistered()).toEqual([]);
  });

  it("returns all registered dataTypes (simple)", () => {
    factory.register(makePlugin("contacts"));
    factory.register(makePlugin("invoices"));

    const registered = factory.listRegistered();
    expect(registered).toContain("contacts");
    expect(registered).toContain("invoices");
    expect(registered).toHaveLength(2);
  });

  it("includes composite keys in the list", () => {
    factory.register(makePlugin("contacts"));
    factory.registerComposite("contacts", "hubspot", makePlugin("contacts"));

    const registered = factory.listRegistered();
    expect(registered).toContain("contacts");
    expect(registered).toContain("contacts:hubspot");
    expect(registered).toHaveLength(2);
  });
});

// =============================================================================
// unregister
// =============================================================================

describe("unregister", () => {
  it("removes a simple plugin and returns true", () => {
    factory.register(makePlugin("contacts"));

    const removed = factory.unregister("contacts");
    expect(removed).toBe(true);
    expect(factory.has("contacts")).toBe(false);
  });

  it("returns false when unregistering non-existent plugin", () => {
    const removed = factory.unregister("contacts");
    expect(removed).toBe(false);
  });

  it("removes composite plugin when connectorId provided", () => {
    factory.registerComposite("contacts", "hubspot", makePlugin("contacts"));

    const removed = factory.unregister("contacts", "hubspot");
    expect(removed).toBe(true);
    expect(factory.has("contacts", "hubspot")).toBe(false);
  });

  it("does not remove simple plugin when unregistering composite", () => {
    factory.register(makePlugin("contacts"));
    factory.registerComposite("contacts", "hubspot", makePlugin("contacts"));

    // Remove only the composite
    factory.unregister("contacts", "hubspot");

    // Simple plugin should still exist
    expect(factory.has("contacts")).toBe(true);
    expect(factory.getStore("contacts")).toBeDefined();
  });

  it("does not remove composite when unregistering simple", () => {
    factory.register(makePlugin("contacts"));
    factory.registerComposite("contacts", "hubspot", makePlugin("contacts"));

    // Remove only the simple
    factory.unregister("contacts");

    // Composite should still exist
    expect(factory.has("contacts", "hubspot")).toBe(true);
  });
});

// =============================================================================
// clear
// =============================================================================

describe("clear", () => {
  it("removes all registered plugins", () => {
    factory.register(makePlugin("contacts"));
    factory.register(makePlugin("invoices"));
    factory.registerComposite("contacts", "hubspot", makePlugin("contacts"));

    factory.clear();

    expect(factory.listRegistered()).toEqual([]);
    expect(factory.has("contacts")).toBe(false);
    expect(factory.has("invoices")).toBe(false);
    expect(factory.has("contacts", "hubspot")).toBe(false);
  });
});

// =============================================================================
// StorePlugin validate and store contract
// =============================================================================

describe("StorePlugin validate/store contract", () => {
  it("validate returns true/false per item", () => {
    const plugin = makePluginWithValidation(
      "contacts",
      (item: unknown) => {
        const record = item as { email?: string };
        return !!record.email;
      }
    );

    expect(plugin.validate({ email: "test@test.com" })).toBe(true);
    expect(plugin.validate({ email: "" })).toBe(false);
    expect(plugin.validate({})).toBe(false);
  });

  it("store returns stored count", async () => {
    const plugin = makePluginWithValidation("contacts", () => true);

    const result = await plugin.store([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(result.stored).toBe(3);
    expect(result.errors).toBe(0);
  });
});

// =============================================================================
// getStoreFactory singleton
// =============================================================================

describe("getStoreFactory", () => {
  it("returns a StoreFactory instance", () => {
    const instance = getStoreFactory();
    expect(instance).toBeInstanceOf(StoreFactory);
  });

  it("returns the same instance on multiple calls (singleton)", () => {
    const instance1 = getStoreFactory();
    const instance2 = getStoreFactory();
    expect(instance1).toBe(instance2);
  });
});
