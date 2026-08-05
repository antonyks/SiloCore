import type { User } from "../types/user";

const WORKSPACE_ROUTE_PATTERN = /^\/workspaces\/(\d+)(?:\/|$)/;

export function getRouteWorkspaceId(pathname: string): number | null {
  const match = WORKSPACE_ROUTE_PATTERN.exec(pathname);

  if (!match) {
    return null;
  }

  const workspaceId = Number(match[1]);

  return Number.isSafeInteger(workspaceId) && workspaceId > 0 ? workspaceId : null;
}

export function getPersonalWorkspaceRoute(user: User): string | null {
  const workspaceId = user.personalWorkspace?.id;

  if (!workspaceId) {
    return null;
  }

  return `/workspaces/${workspaceId}/chat/home`;
}

