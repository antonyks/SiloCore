import axiosClient from "../../../lib/axiosClient";
import { storage } from "../../../lib/storage";
import { UserRole as UserRoleValue } from "../../../types/user"
import type { User, UserRole } from "../../../types/user";
import { type LoginCredentials, type AuthResponse } from "../types";

export const authService = {

  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const { data } = await axiosClient.post<AuthResponse>("/auth/login", credentials);

    storage.setToken(data.data.token);
    storage.setUser(data.data.user);

    return data;
  },

  logout: () => {
    storage.clear();
  },

  getCurrentUser: (): User | null => {
    return storage.getUser();
  },

  getRedirectPath: (role: UserRole): string => {
    switch (role) {
      case UserRoleValue.ADMIN:
        return '/analytics/dashboard';
      case UserRoleValue.USER:
        return '/chat/home';
      default:
        return '/chat/home';
    }
  }
};