import { Navigate } from 'react-router-dom';
import { useAuth } from "../features/auth/hooks/useAuth";
import { UserRole } from '../types/user';

export const RootRedirect = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return user.role === UserRole.ADMIN 
    ? <Navigate to="/analytics/dashboard" replace /> 
    : <Navigate to="/chat/home" replace />;
};
