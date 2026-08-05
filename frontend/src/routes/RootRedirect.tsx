import { Navigate } from 'react-router-dom';
import { useAuth } from "../features/auth/hooks/useAuth";
import { UserRole } from '../types/user';
import { getPersonalWorkspaceRoute } from '../lib/workspaceRouting';

export const RootRedirect = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === UserRole.ADMIN) {
    return <Navigate to="/analytics/dashboard" replace />;
  }

  const workspaceRoute = getPersonalWorkspaceRoute(user);

  return workspaceRoute
    ? <Navigate to={workspaceRoute} replace />
    : <Navigate to="/login" replace />;
};
