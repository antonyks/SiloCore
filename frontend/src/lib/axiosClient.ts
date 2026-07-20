import axios, { AxiosError, type AxiosInstance } from "axios";
import { API_BASE_URL } from "../config/constants";
import { logger } from './logger';
import { isAuthSessionError, logoutAndRedirect } from "./navigation";
import { storage } from "./storage";

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
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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

    if (isAuthSessionError(error.response?.status, responseMessage)) {
      logoutAndRedirect();
    }
    return Promise.reject(error);
  },
);



export default axiosClient;
