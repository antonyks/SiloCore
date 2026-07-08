import { useQuery } from "@tanstack/react-query";
import { adminDashboardQueryKeys } from "./useAdminDashboard";
import { adminDashboardService } from "../services/adminDashboardService";

export const useModelRegistry = () => {
  return useQuery({
    queryKey: adminDashboardQueryKeys.models,
    queryFn: adminDashboardService.getModelRegistry,
  });
};
