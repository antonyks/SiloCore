import type { ReactNode } from "react";
import { FrontendExtensionContext } from "./context";
import type { FrontendExtensionRegistry } from "./types";
export function FrontendExtensionProvider({
  registry,
  children,
}: {
  registry: FrontendExtensionRegistry;
  children: ReactNode;
}) {
  return (
    <FrontendExtensionContext.Provider value={registry}>
      {children}
    </FrontendExtensionContext.Provider>
  );
}
