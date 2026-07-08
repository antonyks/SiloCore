import axiosClient from "../../../lib/axiosClient";
import type { ApiResponse } from "../../../types/api";
import type {
  AdminUser,
  AdminUserCreateInput,
  AdminUserListParams,
  AdminUserUpdateInput,
} from "../types";

export const adminUserService = {
  async getUsers(params: AdminUserListParams = {}): Promise<AdminUser[]> {
    const { data } = await axiosClient.get<ApiResponse<AdminUser[]>>("/users", {
      params,
    });

    return data.data;
  },

  async getUser(id: number): Promise<AdminUser> {
    const { data } = await axiosClient.get<ApiResponse<AdminUser>>(`/users/${id}`);

    return data.data;
  },

  async createUser(input: AdminUserCreateInput): Promise<AdminUser> {
    const { data } = await axiosClient.post<ApiResponse<AdminUser>>("/users", input);

    return data.data;
  },

  async updateUser(id: number, input: AdminUserUpdateInput): Promise<AdminUser> {
    const { data } = await axiosClient.put<ApiResponse<AdminUser>>(`/users/${id}`, input);

    return data.data;
  },

  async banUser(id: number): Promise<AdminUser> {
    const { data } = await axiosClient.post<ApiResponse<AdminUser>>(`/users/ban/${id}`);

    return data.data;
  },

  async activateUser(id: number): Promise<AdminUser> {
    const { data } = await axiosClient.post<ApiResponse<AdminUser>>(`/users/activate/${id}`);

    return data.data;
  },

  async deleteUser(id: number): Promise<AdminUser> {
    const { data } = await axiosClient.delete<ApiResponse<AdminUser>>(`/users/${id}`);

    return data.data;
  },
};
