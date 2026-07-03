import axiosClient from "../../lib/axiosClient";

interface UpdateProfileInput {
  name?: string;
  email?: string;
}

export const userService = {
  getProfile: async () => {
    const response = await axiosClient.get("/users/profile");
    return response.data;
  },

  getProfileById: async (id: string) => {
    const response = await axiosClient.get(`/users/${id}`);
    return response.data;
  },

  updateProfile: async (userData: UpdateProfileInput) => {
    const response = await axiosClient.put("/users/profile", userData);
    return response.data;
  },

  getList: async () => {
    const response = await axiosClient.get("/users");
    return response.data;
  },
};
