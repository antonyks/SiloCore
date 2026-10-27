import { Navigate, Outlet } from "react-router-dom";
import { useWorkspaceController } from "../hooks/useWorkspaceController";
import { WorkspaceContext } from "../workspaceContext";
import { WorkspaceSettingsDialog } from "./WorkspaceSettingsDialog";
import { JobEventSubscriptionProvider } from "../../jobEvents/JobEventSubscriptionProvider";
export function WorkspaceRouteProvider() {
  const context = useWorkspaceController();
  if (!context.personalWorkspaceRoute) return <Navigate to="/login" replace />;
  if (
    context.routeWorkspaceId === null ||
    (context.workspacesQuery.isSuccess && !context.activeWorkspace)
  )
    return <Navigate to={context.personalWorkspaceRoute} replace />;
  return (
    <WorkspaceContext.Provider value={context}>
      <JobEventSubscriptionProvider workspaceId={context.isWorkspaceValidated ? context.activeWorkspaceId : null}>
        <Outlet />
        <WorkspaceSettingsDialog />
      </JobEventSubscriptionProvider>
    </WorkspaceContext.Provider>
  );
}
