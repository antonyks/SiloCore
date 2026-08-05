import axiosClient from "../../../lib/axiosClient";
import type { ApiResponse } from "../../../types/api";
import type { Workspace, WorkspaceCreateInput, WorkspaceUpdateInput } from "../types";

export const workspaceService = {
  async listWorkspaces(options: { workspaceId?: number } = {}): Promise<Workspace[]> {
    const { data } = await axiosClient.get<ApiResponse<Workspace[]>>("/workspaces", {
      headers: options.workspaceId
        ? { "X-Workspace-Id": String(options.workspaceId) }
        : undefined,
    });

    return data.data;
  },

  async createWorkspace(input: WorkspaceCreateInput): Promise<Workspace> {
    const { data } = await axiosClient.post<ApiResponse<Workspace>>("/workspaces", input);

    return data.data;
  },

  async getCurrentWorkspace(): Promise<Workspace> {
    const { data } = await axiosClient.get<ApiResponse<Workspace>>("/workspaces/current");

    return data.data;
  },

  async updateWorkspace(id: number, input: WorkspaceUpdateInput): Promise<Workspace> {
    const { data } = await axiosClient.put<ApiResponse<Workspace>>(`/workspaces/${id}`, input);

    return data.data;
  },

  async deleteWorkspace(id: number): Promise<Workspace> {
    const { data } = await axiosClient.delete<ApiResponse<Workspace>>(`/workspaces/${id}`);

    return data.data;
  },
};
