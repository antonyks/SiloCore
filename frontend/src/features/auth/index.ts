import { storage } from "../../lib/storage";
import axiosClient from "../../lib/axiosClient";

export const authService = {
  login: async (email: string, password: string) => {
    const response = await axiosClient.post("/auth/login", { email, password });
    const { token, user } = response.data;

    storage.setToken(token);
    storage.setUser(user);

    return response.data;
  },

  logout: () => {
    storage.removeToken();
    storage.removeUser();
  },

  getCurrentUser: () => {
    return storage.getUser();
  },
};
