import { createContext, useContext, useSyncExternalStore } from "react";
import type { FrontendExtensionRegistry } from "./types";
export const FrontendExtensionContext =
  createContext<FrontendExtensionRegistry | null>(null);
export function useFrontendExtensions() {
  const registry = useContext(FrontendExtensionContext);
  if (!registry) throw new Error("FrontendExtensionProvider is required");
  return useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  );
}
