import { createContext, useContext } from "react";
import type { useWorkspaceController } from "./hooks/useWorkspaceController";
export const WorkspaceContext = createContext<ReturnType<
  typeof useWorkspaceController
> | null>(null);
export function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("WorkspaceRouteProvider is required");
  return context;
}
