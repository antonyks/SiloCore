import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { User } from "../types";
import type { Workspace } from "../features/workspace/types";

export type ExtensionScope = "admin" | "workspace";
export type AdminPageProps = { user: User };
export type WorkspacePageProps = AdminPageProps & { workspace: Workspace };
export type WorkspaceSlotProps = WorkspacePageProps & {
  ownedWorkspaces: readonly Workspace[];
};
export type ExtensionRoute = {
  id: string;
  path: string;
  title: string;
  requiredCapability?: string;
} & (
  | { scope: "admin"; component: ComponentType<AdminPageProps> }
  | { scope: "workspace"; component: ComponentType<WorkspacePageProps> }
);
export type ExtensionNavigation = {
  id: string;
  routeId: string;
  label: string;
  icon?: LucideIcon;
};
export type WorkspaceSlot = {
  id: string;
  slot: "switcher-footer" | "settings-footer";
  component: ComponentType<WorkspaceSlotProps>;
  requiredCapability?: string;
};
export type FrontendExtensionDefinition = {
  id: string;
  capabilities?: Readonly<Record<string, boolean>>;
  routes?: readonly ExtensionRoute[];
  navigation?: readonly ExtensionNavigation[];
  workspaceSlots?: readonly WorkspaceSlot[];
};
export type FrontendExtensionRegistry = {
  register(definition: FrontendExtensionDefinition): void;
  update(definition: FrontendExtensionDefinition): void;
  unregister(id: string): void;
  getSnapshot(): readonly FrontendExtensionDefinition[];
  subscribe(listener: () => void): () => void;
};
