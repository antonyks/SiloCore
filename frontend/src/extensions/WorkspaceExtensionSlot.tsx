import { useFrontendExtensions } from "./context";
import { isContributionAvailable } from "./registry";
import { useWorkspaceContext } from "../features/workspace/workspaceContext";
import type { WorkspaceSlot } from "./types";
export function WorkspaceExtensionSlot({
  slot,
}: {
  slot: WorkspaceSlot["slot"];
}) {
  const extensions = useFrontendExtensions();
  const { user, activeWorkspace, ownedWorkspaces, isWorkspaceValidated } =
    useWorkspaceContext();
  if (!user || !activeWorkspace || !isWorkspaceValidated) return null;
  return (
    <>
      {extensions.flatMap((extension) =>
        (extension.workspaceSlots || [])
          .filter(
            (item) =>
              item.slot === slot && isContributionAvailable(extension, item),
          )
          .map((item) => {
            const Component = item.component;
            return (
              <Component
                key={`${extension.id}/${item.id}/${activeWorkspace.id}`}
                user={user}
                workspace={activeWorkspace}
                ownedWorkspaces={ownedWorkspaces}
              />
            );
          }),
      )}
    </>
  );
}
