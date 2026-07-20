import axiosClient from "../../../lib/axiosClient";
import { API_BASE_URL } from "../../../config/constants";
import { isAuthSessionError, logoutAndRedirect } from "../../../lib/navigation";
import { storage } from "../../../lib/storage";
import type { ApiResponse } from "../../../types/api";
import type {
  ChatGenerationInput,
  ChatGenerationResponse,
  ChatGenerationStreamEvent,
  ChatSession,
  ChatSessionCreateInput,
  ChatSessionDetail,
  ChatSessionListParams,
  ChatSessionMessage,
  ChatSessionUpdateInput,
} from "../types";

interface StreamGenerateOptions {
  signal?: AbortSignal;
  onEvent: (event: ChatGenerationStreamEvent) => void;
}

const parseSseEvent = (eventText: string): ChatGenerationStreamEvent | null => {
  const lines = eventText.split("\n");
  let eventName = "message";
  const dataLines: string[] = [];

  lines.forEach((line) => {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    }

    if (line.startsWith("data:")) {
      const rawData = line.slice("data:".length);
      dataLines.push(rawData.startsWith(" ") ? rawData.slice(1) : rawData);
    }
  });

  if (dataLines.length === 0) {
    return null;
  }

  const data = JSON.parse(dataLines.join("\n")) as unknown;

  if (
    eventName === "user_message" ||
    eventName === "delta" ||
    eventName === "assistant_message" ||
    eventName === "done" ||
    eventName === "error"
  ) {
    return {
      event: eventName,
      data,
    } as ChatGenerationStreamEvent;
  }

  return null;
};

const getResponseErrorMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
};

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

  async getMessages(id: number): Promise<ChatSessionMessage[]> {
    const { data } = await axiosClient.get<ApiResponse<ChatSessionMessage[]>>(
      `/chat/${id}/messages`,
    );

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

  async generateMessage(id: number, input: ChatGenerationInput): Promise<ChatGenerationResponse> {
    const { data } = await axiosClient.post<ApiResponse<ChatGenerationResponse>>(
      `/chat/${id}/generate`,
      input,
    );

    return data.data;
  },

  async streamGenerateMessage(
    id: number,
    input: ChatGenerationInput,
    options: StreamGenerateOptions,
  ): Promise<void> {
    const token = storage.getToken();
    const response = await fetch(`${API_BASE_URL}/chat/${id}/generate/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorMessage = await getResponseErrorMessage(response);

      if (isAuthSessionError(response.status, errorMessage)) {
        logoutAndRedirect();
      }

      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error("Streaming response is unavailable.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        events.forEach((eventText) => {
          const event = parseSseEvent(eventText.trim());
          if (event) {
            options.onEvent(event);
          }
        });

        if (done) {
          const event = parseSseEvent(buffer.trim());
          if (event) {
            options.onEvent(event);
          }
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};
