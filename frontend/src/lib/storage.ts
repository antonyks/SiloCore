import { TOKEN_KEY, USER_KEY } from "../config/constants";

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

  getUser: (): any => {
    const user = localStorage.getItem(USER_KEY);

    if (!user || user === "undefined") {
    return null;
  }

  try {
    return JSON.parse(user);
  } catch (e) {
    console.error("Corrupted storage found for user key");
    return null;
  }
  },

  setUser: (user: any): void => {
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
