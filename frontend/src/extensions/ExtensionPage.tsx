import { Link } from "react-router-dom";
import { useFrontendExtensions } from "./context";
import { isContributionAvailable } from "./registry";
import { useAuth } from "../features/auth/hooks/useAuth";
import { useWorkspaceContext } from "../features/workspace/workspaceContext";
import { WorkspaceControls } from "../features/workspace/components/WorkspaceControls";
import UserProfileDropdown from "../components/ui/UserProfileDropdown";
import NotFound from "../pages/NotFound";
import { WorkspaceExtensionNavigation } from "./WorkspaceExtensionNavigation";

export function AdminExtensionPage({
  extensionId,
  routeId,
}: {
  extensionId: string;
  routeId: string;
}) {
  const extensions = useFrontendExtensions();
  const { user } = useAuth();
  const extension = extensions.find((item) => item.id === extensionId);
  const route = extension?.routes?.find((item) => item.id === routeId);
  if (
    !user ||
    !extension ||
    !route ||
    route.scope !== "admin" ||
    !isContributionAvailable(extension, route)
  )
    return <NotFound />;
  const Component = route.component;
  return <Component key={`${extensionId}/${routeId}`} user={user} />;
}
export function WorkspaceExtensionPage({
  extensionId,
  routeId,
}: {
  extensionId: string;
  routeId: string;
}) {
  const extensions = useFrontendExtensions();
  const { user, activeWorkspace, isWorkspaceValidated, workspacesQuery } =
    useWorkspaceContext();
  const extension = extensions.find((item) => item.id === extensionId);
  const route = extension?.routes?.find((item) => item.id === routeId);
  if (
    !extension ||
    !route ||
    route.scope !== "workspace" ||
    !isContributionAvailable(extension, route)
  )
    return <NotFound />;
  if (!user || !activeWorkspace || !isWorkspaceValidated)
    return (
      <div role="status">
        {workspacesQuery.isError
          ? "Could not load workspaces."
          : "Loading workspace..."}
      </div>
    );
  const Component = route.component;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b bg-white p-4">
        <span>SiloCore</span>
        <UserProfileDropdown user={user} />
      </header>
      <div className="flex flex-col md:flex-row">
        <aside className="w-full shrink-0 border-r bg-white p-3 md:w-72">
          <WorkspaceControls />
          <Link
            className="mt-3 block px-3 py-2"
            to={`/workspaces/${activeWorkspace.id}/chat/home`}
          >
            Chats
          </Link>
          <WorkspaceExtensionNavigation />
        </aside>
        <main className="min-w-0 flex-1 p-4">
          <h1 className="mb-4 text-xl font-semibold">{route.title}</h1>
          <Component
            key={`${extensionId}/${routeId}/${activeWorkspace.id}`}
            user={user}
            workspace={activeWorkspace}
          />
        </main>
      </div>
    </div>
  );
}
