import { TOKEN_KEY, USER_KEY } from "../config/constants";
import type { User } from "../types/user";

export const storage = {
  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken: (token: string): void => {
    localStorage.setItem(TOKEN_KEY, token);
  },

  removeToken: (): void => {
    localStorage.removeItem(TOKEN_KEY);
  },

  getUser: (): User | null => {
    const user = localStorage.getItem(USER_KEY);

    if (!user || user === "undefined") {
    return null;
  }

  try {
    return JSON.parse(user) as User;
  } catch {
    console.error("Corrupted storage found for user key");
    return null;
  }
  },

  setUser: (user: User): void => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  removeUser: (): void => {
    localStorage.removeItem(USER_KEY);
  },

  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
