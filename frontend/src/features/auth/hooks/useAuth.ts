import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "../services/authService";
import { storage } from "../../../lib/storage";
import { useNavigate } from "react-router-dom";
import type { LoginCredentials } from "../types";


export const useLogin = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: ({ email, password }: LoginCredentials) => authService.login({email, password}),
    onSuccess: (data) => {
      const user = data.data.user;
      storage.setUser(user);
      queryClient.setQueryData(["auth-user"],user);
      
      const url=authService.getRedirectPath(user.role)
      navigate(url);
    },
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return () => {
    authService.logout();
    queryClient.setQueryData(["auth-user"], null);
    queryClient.clear(); 
    navigate("/login");
  };
};


export const useAuth = () => {
  const { 
    data: user, 
    isLoading, 
    isFetching 
  } = useQuery({
    queryKey: ["auth-user"],
    initialData: () => storage.getUser(),
    queryFn: ()=>authService.getCurrentUser(), 
    staleTime: Infinity, 
    enabled: false, 
  });

  return {
    user,
    isAuthenticated: !!user,
    loading: isLoading || isFetching,
  };
};
