import { describe, expect, it, vi } from "vitest";
import { createFrontendExtensionRegistry } from "../../src/extensions/registry";
import type { FrontendExtensionDefinition } from "../../src/extensions/types";
const Page = () => null;
const definition = (): FrontendExtensionDefinition => ({
  id: "sample",
  capabilities: { available: true },
  routes: [
    {
      id: "page",
      scope: "admin",
      path: "reports/overview",
      title: "Reports",
      component: Page,
    },
  ],
  navigation: [{ id: "nav", routeId: "page", label: "Reports" }],
});
describe("frontend extension registry", () => {
  it("isolates instances and publishes stable immutable copies", () => {
    const first = createFrontendExtensionRegistry();
    const second = createFrontendExtensionRegistry();
    const input = definition();
    first.register(input);
    const snapshot = first.getSnapshot();
    expect(first.getSnapshot()).toBe(snapshot);
    input.id = "changed";
    input.routes![0].title = "Changed title";
    input.navigation![0].label = "Changed label";
    expect(snapshot[0].id).toBe("sample");
    expect(snapshot[0].routes![0].title).toBe("Reports");
    expect(snapshot[0].navigation![0].label).toBe("Reports");
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0].routes?.[0])).toBe(true);
    expect(Object.isFrozen(snapshot[0].navigation)).toBe(true);
    expect(Object.isFrozen(snapshot[0].capabilities)).toBe(true);
    expect(second.getSnapshot()).toEqual([]);
  });
  it("publishes update and removal, preserves order, and unsubscribes", () => {
    const registry = createFrontendExtensionRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    registry.register(definition());
    registry.register({ id: "second" });
    registry.update({ ...definition(), capabilities: { available: false } });
    expect(registry.getSnapshot().map((item) => item.id)).toEqual([
      "sample",
      "second",
    ]);
    registry.unregister("sample");
    expect(listener).toHaveBeenCalledTimes(4);
    registry.unregister("absent");
    unsubscribe();
    registry.unregister("second");
    expect(listener).toHaveBeenCalledTimes(4);
  });
  it.each([
    "/login",
    "*",
    "../chat",
    "reports/*",
    ":workspaceId",
    "https://example.com",
    "reports?x=1",
    "reports#x",
    "Reports",
    "reports//overview",
    "reports/",
    "",
  ])("rejects unsafe route %s atomically", (path) => {
    const registry = createFrontendExtensionRegistry();
    registry.register(definition());
    const before = registry.getSnapshot();
    expect(() =>
      registry.update({
        ...definition(),
        routes: [{ ...definition().routes![0], path }],
      }),
    ).toThrow();
    expect(registry.getSnapshot()).toBe(before);
  });
  it("rejects duplicate IDs, scoped paths and dangling navigation without publishing", () => {
    const registry = createFrontendExtensionRegistry();
    registry.register(definition());
    const before = registry.getSnapshot();
    expect(() => registry.register(definition())).toThrow();
    expect(() => registry.update({ id: "absent" })).toThrow();
    expect(() =>
      registry.update({
        ...definition(),
        navigation: [{ id: "page", routeId: "page", label: "Reports" }],
      }),
    ).toThrow();
    expect(() =>
      registry.update({
        ...definition(),
        navigation: [{ id: "nav", routeId: "absent", label: "Reports" }],
      }),
    ).toThrow();
    expect(() =>
      registry.update({
        ...definition(),
        routes: [
          ...definition().routes!,
          { ...definition().routes![0], id: "another" },
        ],
      }),
    ).toThrow();
    expect(registry.getSnapshot()).toBe(before);
  });
});
