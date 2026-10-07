import type {
  FrontendExtensionDefinition,
  FrontendExtensionRegistry,
  ExtensionRoute,
} from "./types";

const slug = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
function validate(
  definition: FrontendExtensionDefinition,
): FrontendExtensionDefinition {
  if (!slug.test(definition.id)) throw new Error("Invalid extension ID");
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const item of [
    ...(definition.routes || []),
    ...(definition.navigation || []),
    ...(definition.workspaceSlots || []),
  ]) {
    if (!slug.test(item.id) || ids.has(item.id))
      throw new Error("Invalid or duplicate contribution ID");
    ids.add(item.id);
  }
  for (const [key, value] of Object.entries(definition.capabilities || {})) {
    if (!slug.test(key) || typeof value !== "boolean")
      throw new Error("Invalid capability");
  }
  for (const route of definition.routes || []) {
    if (
      !["admin", "workspace"].includes(route.scope) ||
      !route.path.split("/").every((segment) => slug.test(segment))
    )
      throw new Error("Invalid extension route");
    const path = `${route.scope}/${route.path}`;
    if (paths.has(path)) throw new Error("Duplicate extension route");
    paths.add(path);
    if (!route.title.trim() || !route.component)
      throw new Error("Invalid route component or title");
  }
  for (const nav of definition.navigation || []) {
    if (
      !definition.routes?.some((route) => route.id === nav.routeId) ||
      !nav.label.trim()
    )
      throw new Error("Invalid navigation route reference or label");
  }
  for (const slot of definition.workspaceSlots || []) {
    if (
      !["switcher-footer", "settings-footer"].includes(slot.slot) ||
      !slot.component
    )
      throw new Error("Invalid workspace slot");
  }
  for (const item of [
    ...(definition.routes || []),
    ...(definition.workspaceSlots || []),
  ]) {
    if (
      item.requiredCapability !== undefined &&
      !slug.test(item.requiredCapability)
    )
      throw new Error("Invalid required capability");
  }
  return Object.freeze({
    id: definition.id,
    capabilities: Object.freeze({ ...definition.capabilities }),
    routes: Object.freeze(
      (definition.routes || []).map((item) => Object.freeze({ ...item })),
    ),
    navigation: Object.freeze(
      (definition.navigation || []).map((item) => Object.freeze({ ...item })),
    ),
    workspaceSlots: Object.freeze(
      (definition.workspaceSlots || []).map((item) =>
        Object.freeze({ ...item }),
      ),
    ),
  });
}
export function createFrontendExtensionRegistry(): FrontendExtensionRegistry {
  let snapshot: readonly FrontendExtensionDefinition[] = Object.freeze([]);
  const listeners = new Set<() => void>();
  const publish = (next: FrontendExtensionDefinition[]) => {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  };
  return {
    register(definition) {
      if (snapshot.some((item) => item.id === definition.id))
        throw new Error("Extension already registered");
      publish([...snapshot, validate(definition)]);
    },
    update(definition) {
      if (!snapshot.some((item) => item.id === definition.id))
        throw new Error("Unknown extension");
      const validated = validate(definition);
      publish(
        snapshot.map((item) => (item.id === definition.id ? validated : item)),
      );
    },
    unregister(id) {
      if (snapshot.some((item) => item.id === id))
        publish(snapshot.filter((item) => item.id !== id));
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export function isContributionAvailable(
  extension: FrontendExtensionDefinition,
  item: { requiredCapability?: string },
) {
  return (
    item.requiredCapability === undefined ||
    extension.capabilities?.[item.requiredCapability] === true
  );
}
export function extensionRoutePath(
  extensionId: string,
  route: ExtensionRoute,
  workspaceId: string | number = ":workspaceId",
) {
  const prefix =
    route.scope === "admin" ? "/admin" : `/workspaces/${workspaceId}`;
  return `${prefix}/extensions/${extensionId}/${route.path}`;
}
