import axios, { AxiosError, type AxiosInstance } from "axios";
import { API_BASE_URL } from "../config/constants";
import { logger } from './logger';
import { isAuthSessionError, logoutAndRedirect } from "./navigation";
import { storage } from "./storage";
import { getRouteWorkspaceId } from "./workspaceRouting";

const axiosClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosClient.interceptors.request.use(
  (config) => {
    const token = storage.getToken();
    if (token && config.url !== "/auth/login") {
      config.headers.Authorization = `Bearer ${token}`;

      const hasWorkspaceHeader =
        config.headers.has?.("X-Workspace-Id") ||
        config.headers.has?.("x-workspace-id") ||
        Boolean(config.headers["X-Workspace-Id"] ?? config.headers["x-workspace-id"]);

      if (!hasWorkspaceHeader) {
        const routeWorkspaceId = getRouteWorkspaceId(window.location.pathname);
        const workspaceId = routeWorkspaceId ?? storage.getPersonalWorkspaceId();

        if (workspaceId !== null) {
          config.headers["X-Workspace-Id"] = String(workspaceId);
        }
      }
    }
    return config;
  },
  (error) => {
    logger.error('Request error:', error);
    return Promise.reject(error);
  },
);

axiosClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {

    const responseMessage =
      typeof error.response?.data === "object" &&
      error.response.data !== null &&
      "message" in error.response.data &&
      typeof error.response.data.message === "string"
        ? error.response.data.message
        : error.message;

    const authorization = error.config?.headers?.get("Authorization");
    const requestToken = typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    if (
      error.config?.url !== "/auth/login" &&
      isAuthSessionError(error.response?.status, responseMessage) &&
      storage.getToken() === requestToken
    ) {
      logoutAndRedirect();
    }
    return Promise.reject(error);
  },
);



export default axiosClient;
