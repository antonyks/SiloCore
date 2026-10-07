import { NavLink } from "react-router-dom";
import { useFrontendExtensions } from "./context";
import { extensionRoutePath, isContributionAvailable } from "./registry";
import { useWorkspaceContext } from "../features/workspace/workspaceContext";
export function WorkspaceExtensionNavigation() {
  const extensions = useFrontendExtensions();
  const { activeWorkspace, isWorkspaceValidated } = useWorkspaceContext();
  if (!activeWorkspace || !isWorkspaceValidated) return null;
  return (
    <>
      {extensions.flatMap((extension) =>
        (extension.navigation || []).flatMap((item) => {
          const route = extension.routes?.find(
            (route) => route.id === item.routeId && route.scope === "workspace",
          );
          if (!route || !isContributionAvailable(extension, route)) return [];
          const Icon = item.icon;
          return [
            <NavLink
              key={`${extension.id}/${item.id}`}
              to={extensionRoutePath(extension.id, route, activeWorkspace.id)}
              className="mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-100"
            >
              {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
              {item.label}
            </NavLink>,
          ];
        }),
      )}
    </>
  );
}
