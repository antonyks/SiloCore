import axios, { AxiosError, type AxiosInstance } from "axios";
import { API_BASE_URL } from "../config/constants";
import { logger } from './logger';
import { logoutAndRedirect } from "./navigation";

const axiosClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
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

    if (error.response?.status === 401) {
      logoutAndRedirect();
    }
    return Promise.reject(error);
  },
);



export default axiosClient;
