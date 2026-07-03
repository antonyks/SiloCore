import { useQuery } from "@tanstack/react-query";
import { adminDashboardService } from "../services/adminDashboardService";

export const adminDashboardQueryKeys = {
  providers: ["admin-dashboard", "providers"] as const,
  models: ["admin-dashboard", "models"] as const,
  users: ["admin-dashboard", "users"] as const,
};

export const useAdminDashboard = () => {
  const providersQuery = useQuery({
    queryKey: adminDashboardQueryKeys.providers,
    queryFn: adminDashboardService.getProviders,
  });

  const modelsQuery = useQuery({
    queryKey: adminDashboardQueryKeys.models,
    queryFn: adminDashboardService.getModelRegistry,
  });

  const usersQuery = useQuery({
    queryKey: adminDashboardQueryKeys.users,
    queryFn: adminDashboardService.getUserPreview,
  });

  return {
    providersQuery,
    modelsQuery,
    usersQuery,
  };
};
