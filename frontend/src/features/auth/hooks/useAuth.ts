import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "../services/authService";
import { storage } from "../../../lib/storage";
import { useNavigate } from "react-router-dom";
import type { LoginCredentials } from "../types";
import { useApp } from "../../../contexts/AppContext";


export const useUser = () => {
  
  return useQuery({
    queryKey: ["auth-user"],
    queryFn: ()=>authService.getCurrentUser(),
    initialData: storage.getUser(),
    staleTime: Infinity,
  });
};

export const useLogin = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setUser } = useApp();

  return useMutation({
    mutationFn: ({ email, password }: LoginCredentials) => authService.login({email, password}),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth-user"], data.data.user);
      setUser(data.data.user);
      
      const url=authService.getRedirectPath(data.data.user.role)
      navigate(url);
    },
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return () => {
    authService.logout();
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
