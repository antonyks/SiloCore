import axiosClient from "../../../lib/axiosClient";
import type { ApiResponse } from "../../../types/api";
import type {
  ChatSession,
  ChatSessionCreateInput,
  ChatSessionDetail,
  ChatSessionListParams,
  ChatSessionUpdateInput,
} from "../types";

export const chatService = {
  async getSessions(params: ChatSessionListParams = {}): Promise<ChatSession[]> {
    const { data } = await axiosClient.get<ApiResponse<ChatSession[]>>("/chat", {
      params,
    });

    return data.data;
  },

  async createSession(input: ChatSessionCreateInput): Promise<ChatSession> {
    const { data } = await axiosClient.post<ApiResponse<ChatSession>>("/chat", input);

    return data.data;
  },

  async getSession(id: number): Promise<ChatSessionDetail> {
    const { data } = await axiosClient.get<ApiResponse<ChatSessionDetail>>(`/chat/${id}`);

    return data.data;
  },

  async updateSession(id: number, input: ChatSessionUpdateInput): Promise<ChatSession> {
    const { data } = await axiosClient.put<ApiResponse<ChatSession>>(`/chat/${id}`, input);

    return data.data;
  },

  async deleteSession(id: number): Promise<ChatSession> {
    const { data } = await axiosClient.delete<ApiResponse<ChatSession>>(`/chat/${id}`);

    return data.data;
  },
};
